import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest, signToken } from '../middleware/auth';

const router = Router();

const USER_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

// 招待リンク生成（オーナーのみ）
router.post('/', authenticate, (req: AuthRequest, res: Response): void => {
  const { calendar_id, role } = req.body as { calendar_id: string; role?: string };
  if (!calendar_id) { res.status(400).json({ error: 'calendar_id は必須です' }); return; }

  const member = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(calendar_id, req.userId) as { role: string } | undefined;
  if (!member || member.role !== 'owner') {
    res.status(403).json({ error: 'オーナーのみ招待リンクを作成できます' }); return;
  }

  const validRoles = ['editor', 'viewer'];
  const assignRole = validRoles.includes(role || '') ? role! : 'viewer';

  const token = uuidv4().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO invitations (token, calendar_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)').run(token, calendar_id, assignRole, req.userId, expiresAt);

  res.json({ token });
});

// 招待トークンの情報取得（認証不要）
router.get('/:token', (req: Request, res: Response): void => {
  const inv = db.prepare(`
    SELECT i.token, i.role, i.expires_at, c.name as calendar_name, c.color as calendar_color, u.name as inviter_name
    FROM invitations i
    JOIN calendars c ON i.calendar_id = c.id
    JOIN users u ON i.created_by = u.id
    WHERE i.token = ?
  `).get(req.params.token) as { token: string; role: string; expires_at: string; calendar_name: string; calendar_color: string; inviter_name: string } | undefined;

  if (!inv) { res.status(404).json({ error: '招待リンクが見つかりません' }); return; }
  if (new Date(inv.expires_at) < new Date()) { res.status(410).json({ error: '招待リンクの有効期限が切れています' }); return; }

  res.json({ invitation: inv });
});

// 招待トークンで参加（名前だけでOK）
router.post('/:token/join', (req: Request, res: Response): void => {
  const { name } = req.body as { name: string };
  if (!name || !name.trim()) { res.status(400).json({ error: '名前は必須です' }); return; }

  const inv = db.prepare('SELECT * FROM invitations WHERE token = ?').get(req.params.token) as { token: string; calendar_id: string; role: string; expires_at: string } | undefined;
  if (!inv) { res.status(404).json({ error: '招待リンクが見つかりません' }); return; }
  if (new Date(inv.expires_at) < new Date()) { res.status(410).json({ error: '招待リンクの有効期限が切れています' }); return; }

  const userId = uuidv4();
  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  const guestEmail = `guest_${userId}@invite.local`;

  db.prepare('INSERT INTO users (id, name, email, password_hash, color) VALUES (?, ?, ?, ?, ?)').run(userId, name.trim(), guestEmail, '', color);

  // デフォルトカレンダー作成
  const calId = uuidv4();
  db.prepare('INSERT INTO calendars (id, name, color, owner_id, is_default) VALUES (?, ?, ?, ?, 1)').run(calId, `${name.trim()}のカレンダー`, color, userId);
  db.prepare('INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)').run(calId, userId, 'owner');

  // 招待されたカレンダーに追加
  db.prepare('INSERT OR IGNORE INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)').run(inv.calendar_id, userId, inv.role);

  const token = signToken(userId);
  res.json({ token, user: { id: userId, name: name.trim(), email: guestEmail, color } });
});

export default router;
