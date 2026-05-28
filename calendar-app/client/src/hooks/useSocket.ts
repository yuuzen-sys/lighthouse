import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CalendarEvent } from '../types';

type EventHandlers = {
  onEventCreated: (e: CalendarEvent) => void;
  onEventUpdated: (e: CalendarEvent) => void;
  onEventDeleted: (data: { id: string; calendar_id: string }) => void;
};

export function useSocket(token: string | null, handlers: EventHandlers) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = io('/', { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('event:created', handlers.onEventCreated);
    socket.on('event:updated', handlers.onEventUpdated);
    socket.on('event:deleted', handlers.onEventDeleted);

    return () => { socket.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return socketRef;
}
