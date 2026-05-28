import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { signToken, authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const USER_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

router.post('/register', (req: Request, res: Response): void => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (!name || !email || !password) {
    res.status(400).json({ error: '名前・メール・パスワードは必須です' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  const userId = uuidv4();
  const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  db.prepare('INSERT INTO users (id, name, email, password_hash, color) VALUES (?, ?, ?, ?, ?)').run(userId, name, email, hash, color);

  const calendarId = uuidv4();
  db.prepare('INSERT INTO calendars (id, name, color, owner_id, is_default) VALUES (?, ?, ?, ?, 1)').run(calendarId, `${name}のカレンダー`, color, userId);
  db.prepare('INSERT INTO calendar_members (calendar_id, user_id, role) VALUES (?, ?, ?)').run(calendarId, userId, 'owner');

  const token = signToken(userId);
  res.json({ token, user: { id: userId, name, email, color } });
});

router.post('/login', (req: Request, res: Response): void => {
  const { email, password } = req.body as { email: string; password: string };
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as { id: string; name: string; email: string; password_hash: string; color: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
    return;
  }
  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, color: user.color } });
});

router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.prepare('SELECT id, name, email, color FROM users WHERE id = ?').get(req.userId) as { id: string; name: string; email: string; color: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'ユーザーが見つかりません' });
    return;
  }
  res.json({ user });
});

export default router;
