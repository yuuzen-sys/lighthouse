import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import authRouter from './routes/auth';
import calendarsRouter from './routes/calendars';
import eventsRouter, { setIo } from './routes/events';
import invitationsRouter from './routes/invitations';
import db from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'calendar-app-secret-key-change-in-production';
const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173', credentials: true }
});

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/invitations', invitationsRouter);

setIo(io);

io.use((socket, next) => {
  const token = socket.handshake.auth.token as string;
  if (!token) { next(new Error('認証が必要です')); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error('トークンが無効です'));
  }
});

io.on('connection', (socket) => {
  const userId: string = socket.data.userId;

  // ユーザーがアクセスできるカレンダーのルームに参加
  const calendars = db.prepare('SELECT calendar_id FROM calendar_members WHERE user_id = ?').all(userId) as { calendar_id: string }[];
  calendars.forEach(({ calendar_id }) => socket.join(`calendar:${calendar_id}`));

  socket.on('join:calendar', (calendarId: string) => {
    const member = db.prepare('SELECT 1 FROM calendar_members WHERE calendar_id = ? AND user_id = ?').get(calendarId, userId);
    if (member) socket.join(`calendar:${calendarId}`);
  });

  socket.on('leave:calendar', (calendarId: string) => {
    socket.leave(`calendar:${calendarId}`);
  });

  socket.on('disconnect', () => {});
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
