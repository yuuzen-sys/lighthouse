import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Server } from 'socket.io';

let io: Server;
export function setIo(instance: Server) { io = instance; }

const router = Router();
router.use(authenticate);

function hasAccess(calendarId: string, userId: string, needsWrite = false): boolean {
  const member = db.prepare('SELECT role FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(calendarId, userId) as { role: string } | undefined;
  if (!member) return false;
  if (needsWrite) return member.role === 'owner' || member.role === 'editor';
  return true;
}

router.get('/', (req: AuthRequest, res: Response): void => {
  const { start, end } = req.query as { start?: string; end?: string };
  const events = db.prepare(`
    SELECT e.*, c.color as calendar_color, c.name as calendar_name
    FROM events e
    JOIN calendars c ON e.calendar_id = c.id
    JOIN calendar_members cm ON c.id = cm.calendar_id
    WHERE cm.user_id = ?
    ${start ? 'AND e.end_at >= ?' : ''}
    ${end ? 'AND e.start_at <= ?' : ''}
    ORDER BY e.start_at ASC
  `).all(...[req.userId, start, end].filter(Boolean) as string[]);
  res.json({ events });
});

router.post('/', (req: AuthRequest, res: Response): void => {
  const { calendar_id, title, description, start_at, end_at, all_day, color } = req.body as {
    calendar_id: string; title: string; description?: string;
    start_at: string; end_at: string; all_day?: boolean; color?: string;
  };
  if (!calendar_id || !title || !start_at || !end_at) {
    res.status(400).json({ error: '必須フィールドが不足しています' }); return;
  }
  if (!hasAccess(calendar_id, req.userId!, true)) {
    res.status(403).json({ error: '書き込み権限がありません' }); return;
  }
  const id = uuidv4();
  db.prepare(`
    INSERT INTO events (id, calendar_id, title, description, start_at, end_at, all_day, color, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, calendar_id, title, description || '', start_at, end_at, all_day ? 1 : 0, color || null, req.userId);

  const event = db.prepare('SELECT e.*, c.color as calendar_color, c.name as calendar_name FROM events e JOIN calendars c ON e.calendar_id = c.id WHERE e.id = ?').get(id);
  io?.to(`calendar:${calendar_id}`).emit('event:created', event);
  res.json({ event });
});

router.put('/:id', (req: AuthRequest, res: Response): void => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as { calendar_id: string } | undefined;
  if (!ev) { res.status(404).json({ error: 'イベントが見つかりません' }); return; }
  if (!hasAccess(ev.calendar_id, req.userId!, true)) {
    res.status(403).json({ error: '書き込み権限がありません' }); return;
  }
  const { title, description, start_at, end_at, all_day, color, calendar_id } = req.body as {
    title?: string; description?: string; start_at?: string; end_at?: string;
    all_day?: boolean; color?: string; calendar_id?: string;
  };
  if (calendar_id && calendar_id !== ev.calendar_id && !hasAccess(calendar_id, req.userId!, true)) {
    res.status(403).json({ error: '移動先カレンダーへの書き込み権限がありません' }); return;
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (start_at !== undefined) { fields.push('start_at = ?'); values.push(start_at); }
  if (end_at !== undefined) { fields.push('end_at = ?'); values.push(end_at); }
  if (all_day !== undefined) { fields.push('all_day = ?'); values.push(all_day ? 1 : 0); }
  if (color !== undefined) { fields.push('color = ?'); values.push(color); }
  if (calendar_id !== undefined) { fields.push('calendar_id = ?'); values.push(calendar_id); }
  fields.push('updated_at = datetime(\'now\')');
  values.push(req.params.id);
  db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT e.*, c.color as calendar_color, c.name as calendar_name FROM events e JOIN calendars c ON e.calendar_id = c.id WHERE e.id = ?').get(req.params.id);
  io?.to(`calendar:${ev.calendar_id}`).emit('event:updated', updated);
  if (calendar_id && calendar_id !== ev.calendar_id) {
    io?.to(`calendar:${calendar_id}`).emit('event:updated', updated);
  }
  res.json({ event: updated });
});

router.delete('/:id', (req: AuthRequest, res: Response): void => {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as { id: string; calendar_id: string } | undefined;
  if (!ev) { res.status(404).json({ error: 'イベントが見つかりません' }); return; }
  if (!hasAccess(ev.calendar_id, req.userId!, true)) {
    res.status(403).json({ error: '書き込み権限がありません' }); return;
  }
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  io?.to(`calendar:${ev.calendar_id}`).emit('event:deleted', { id: ev.id, calendar_id: ev.calendar_id });
  res.json({ ok: true });
});

export default router;
