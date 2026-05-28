import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response): void => {
  const calendars = db.prepare(`
    SELECT c.*, cm.role,
      (SELECT COUNT(*) FROM calendar_members WHERE calendar_id = c.id) as member_count
    FROM calendars c
    JOIN calendar_members cm ON c.id = cm.calendar_id
    WHERE cm.user_id = ?
    ORDER BY c.is_default DESC, c.created_at ASC
  `).all(req.userId);
  res.json({ calendars });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { name, color } = req.body as { name: string; color?: string };
  if (!name) { res.status(400).json({ error: 'カレンダー名は必須です' }); return; }
  const id = uuidv4();
  db.prepare('INSERT INTO calendars (id, name, color, owner_id) VALUES (?, ?, ?, ?)').run(id, name, color || '#3b82f6', req.userId);
  db.prepare('INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)').run(id, req.userId, 'owner');
  const calendar = db.prepare('SELECT * FROM calendars WHERE id = ?').get(id);
  res.json({ calendar });
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const { name, color } = req.body as { name?: string; color?: string };
  const member = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(req.params.id, req.userId) as { role: string } | undefined;
  if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
    res.status(403).json({ error: '権限がありません' }); return;
  }
  if (name) db.prepare('UPDATE calendars SET name = ? WHERE id = ?').run(name, req.params.id);
  if (color) db.prepare('UPDATE calendars SET color = ? WHERE id = ?').run(color, req.params.id);
  const calendar = db.prepare('SELECT * FROM calendars WHERE id = ?').get(req.params.id);
  res.json({ calendar });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const cal = db.prepare('SELECT * FROM calendars WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId) as { is_default: number } | undefined;
  if (!cal) { res.status(403).json({ error: '削除権限がありません' }); return; }
  if (cal.is_default) { res.status(400).json({ error: 'デフォルトカレンダーは削除できません' }); return; }
  db.prepare('DELETE FROM calendars WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// メンバー管理
router.get('/:id/members', (req: AuthRequest, res: Response): void => {
  const member = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!member) { res.status(403).json({ error: 'アクセス権限がありません' }); return; }
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.color, cm.role
    FROM calendar_members cm JOIN users u ON cm.user_id = u.id
    WHERE cm.calendar_id = ?
  `).all(req.params.id);
  res.json({ members });
});

router.post('/:id/members', (req: AuthRequest, res: Response): void => {
  const owner = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(req.params.id, req.userId) as { role: string } | undefined;
  if (!owner || owner.role !== 'owner') { res.status(403).json({ error: 'オーナーのみメンバーを追加できます' }); return; }
  const { email, role } = req.body as { email: string; role: string };
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
  if (!user) { res.status(404).json({ error: 'ユーザーが見つかりません' }); return; }
  const validRoles = ['editor', 'viewer'];
  if (!validRoles.includes(role)) { res.status(400).json({ error: '無効なロールです' }); return; }
  db.prepare('INSERT OR REPLACE INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, user.id, role);
  res.json({ ok: true });
});

router.delete('/:id/members/:userId', (req: AuthRequest, res: Response): void => {
  const owner = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(req.params.id, req.userId) as { role: string } | undefined;
  if (!owner || owner.role !== 'owner') { res.status(403).json({ error: 'オーナーのみメンバーを削除できます' }); return; }
  if (req.params.userId === req.userId) { res.status(400).json({ error: 'オーナーは自分を削除できません' }); return; }
  db.prepare('DELETE FROM calendar_members WHERE calendar_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  res.json({ ok: true });
});

export default router;
