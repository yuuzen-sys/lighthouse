import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { api } from './api/client';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import CalendarView from './components/CalendarView';
import EventModal from './components/EventModal';
import type { Calendar, CalendarEvent } from './types';

function getInviteToken(): string | undefined {
  return new URLSearchParams(window.location.search).get('invite') ?? undefined;
}

export default function App() {
  const { user, loading, login, register, logout, joinByInvite } = useAuth();
  const [inviteToken] = useState<string | undefined>(getInviteToken);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendars, setVisibleCalendars] = useState<Set<string>>(new Set());
  const [modalState, setModalState] = useState<{ open: boolean; event?: CalendarEvent; defaultDate?: string }>({ open: false });

  const loadCalendars = useCallback(async () => {
    if (!user) return;
    const { calendars: cals } = await api.calendars.list();
    setCalendars(cals);
    setVisibleCalendars(new Set(cals.map(c => c.id)));
  }, [user]);

  const loadEvents = useCallback(async () => {
    if (!user) return;
    const { events: evs } = await api.events.list();
    setEvents(evs);
  }, [user]);

  useEffect(() => {
    if (user) { loadCalendars(); loadEvents(); }
  }, [user, loadCalendars, loadEvents]);

  useSocket(user ? localStorage.getItem('token') : null, {
    onEventCreated: (e) => setEvents(prev => [...prev.filter(x => x.id !== e.id), e]),
    onEventUpdated: (e) => setEvents(prev => prev.map(x => x.id === e.id ? e : x)),
    onEventDeleted: ({ id }) => setEvents(prev => prev.filter(x => x.id !== id)),
  });

  function toggleCalendar(id: string) {
    setVisibleCalendars(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function closeModal() { setModalState({ open: false }); }
  function handleSaved() { closeModal(); loadEvents(); }
  function handleDeleted() { closeModal(); loadEvents(); }

  if (loading) return <div style={loadingStyle}>読み込み中...</div>;
  if (!user) return <AuthPage onLogin={login} onRegister={register} onJoinByInvite={joinByInvite} inviteToken={inviteToken} />;

  return (
    <div style={appStyle}>
      <Sidebar
        user={user}
        calendars={calendars}
        visibleCalendars={visibleCalendars}
        onToggleCalendar={toggleCalendar}
        onCalendarsChange={loadCalendars}
        onLogout={logout}
      />
      <main style={mainStyle}>
        <CalendarView
          events={events}
          visibleCalendars={visibleCalendars}
          onDateClick={(date) => setModalState({ open: true, defaultDate: date })}
          onEventClick={(event) => setModalState({ open: true, event })}
        />
        <button
          style={fabStyle}
          onClick={() => setModalState({ open: true })}
          title="新しいイベント"
        >
          ＋
        </button>
      </main>
      {modalState.open && (
        <EventModal
          event={modalState.event}
          defaultDate={modalState.defaultDate}
          calendars={calendars}
          onClose={closeModal}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

const appStyle: React.CSSProperties = { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };
const mainStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' };
const loadingStyle: React.CSSProperties = { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#64748b' };
const fabStyle: React.CSSProperties = {
  position: 'absolute', bottom: 28, right: 28, width: 56, height: 56,
  background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '50%',
  fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(59,130,246,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
};
