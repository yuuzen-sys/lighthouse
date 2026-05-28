import { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, format, addMonths, subMonths,
  addWeeks, subWeeks, addDays, subDays, parseISO,
  startOfWeek as weekStart, endOfWeek as weekEnd,
  startOfDay, endOfDay, areIntervalsOverlapping
} from 'date-fns';
import { ja } from 'date-fns/locale';
import type { CalendarEvent, ViewMode } from '../types';

interface Props {
  events: CalendarEvent[];
  visibleCalendars: Set<string>;
  onDateClick: (date: string) => void;
  onEventClick: (event: CalendarEvent) => void;
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarView({ events, visibleCalendars, onDateClick, onEventClick }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');

  const filtered = useMemo(() =>
    events.filter(e => visibleCalendars.has(e.calendar_id)),
    [events, visibleCalendars]
  );

  function navigate(dir: 1 | -1) {
    if (view === 'month') setCurrentDate(d => dir > 0 ? addMonths(d, 1) : subMonths(d, 1));
    else if (view === 'week') setCurrentDate(d => dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate(d => dir > 0 ? addDays(d, 1) : subDays(d, 1));
  }

  const title = view === 'month'
    ? format(currentDate, 'yyyy年M月', { locale: ja })
    : view === 'week'
    ? `${format(weekStart(currentDate, { weekStartsOn: 0 }), 'M/d')} – ${format(weekEnd(currentDate, { weekStartsOn: 0 }), 'M/d')}`
    : format(currentDate, 'yyyy年M月d日(E)', { locale: ja });

  function eventsOnDay(day: Date) {
    return filtered.filter(e => {
      const start = parseISO(e.start_at);
      const end = parseISO(e.end_at);
      return areIntervalsOverlapping(
        { start: startOfDay(day), end: endOfDay(day) },
        { start, end },
        { inclusive: true }
      );
    });
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.navGroup}>
          <button style={styles.navBtn} onClick={() => setCurrentDate(new Date())}>今日</button>
          <button style={styles.navBtn} onClick={() => navigate(-1)}>‹</button>
          <button style={styles.navBtn} onClick={() => navigate(1)}>›</button>
          <span style={styles.dateTitle}>{title}</span>
        </div>
        <div style={styles.viewBtns}>
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button key={v} style={{ ...styles.viewBtn, ...(view === v ? styles.viewBtnActive : {}) }} onClick={() => setView(v)}>
              {v === 'month' ? '月' : v === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && <MonthView currentDate={currentDate} eventsOnDay={eventsOnDay} onDateClick={onDateClick} onEventClick={onEventClick} />}
      {view === 'week' && <WeekView currentDate={currentDate} filtered={filtered} eventsOnDay={eventsOnDay} onDateClick={onDateClick} onEventClick={onEventClick} />}
      {view === 'day' && <DayView currentDate={currentDate} filtered={filtered} onDateClick={onDateClick} onEventClick={onEventClick} />}
    </div>
  );
}

function MonthView({ currentDate, eventsOnDay, onDateClick, onEventClick }: {
  currentDate: Date;
  eventsOnDay: (d: Date) => CalendarEvent[];
  onDateClick: (date: string) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div style={styles.grid}>
      {DAYS.map(d => <div key={d} style={styles.dayHeader}>{d}</div>)}
      {days.map(day => {
        const dayEvents = eventsOnDay(day);
        const isCurrentMonth = isSameMonth(day, currentDate);
        const isToday_ = isToday(day);
        return (
          <div
            key={day.toISOString()}
            style={{ ...styles.dayCell, ...(isCurrentMonth ? {} : styles.otherMonth) }}
            onClick={() => onDateClick(format(day, 'yyyy-MM-dd'))}
          >
            <span style={{ ...styles.dayNum, ...(isToday_ ? styles.todayNum : {}) }}>
              {format(day, 'd')}
            </span>
            <div style={styles.eventList}>
              {dayEvents.slice(0, 3).map(e => (
                <div
                  key={e.id}
                  style={{ ...styles.eventChip, background: e.color || e.calendar_color }}
                  onClick={ev => { ev.stopPropagation(); onEventClick(e); }}
                >
                  {e.title}
                </div>
              ))}
              {dayEvents.length > 3 && <div style={styles.moreChip}>+{dayEvents.length - 3}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ currentDate, filtered, eventsOnDay, onDateClick, onEventClick }: {
  currentDate: Date;
  filtered: CalendarEvent[];
  eventsOnDay: (d: Date) => CalendarEvent[];
  onDateClick: (date: string) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const weekDays = eachDayOfInterval({
    start: weekStart(currentDate, { weekStartsOn: 0 }),
    end: weekEnd(currentDate, { weekStartsOn: 0 }),
  });
  const allDayEvents = weekDays.map(d => eventsOnDay(d).filter(e => e.all_day));

  return (
    <div style={styles.weekContainer}>
      <div style={styles.weekHeader}>
        <div style={{ width: 52, flexShrink: 0 }} />
        {weekDays.map(d => (
          <div key={d.toISOString()} style={styles.weekDayHeader} onClick={() => onDateClick(format(d, 'yyyy-MM-dd'))}>
            <span style={styles.weekDayLabel}>{DAYS[d.getDay()]}</span>
            <span style={{ ...styles.weekDayNum, ...(isToday(d) ? styles.todayNum : {}) }}>{format(d, 'd')}</span>
          </div>
        ))}
      </div>
      {allDayEvents.some(es => es.length > 0) && (
        <div style={styles.allDayRow}>
          <div style={{ width: 52, flexShrink: 0, fontSize: 10, color: '#94a3b8', textAlign: 'right', paddingRight: 8, paddingTop: 4 }}>終日</div>
          {weekDays.map((d, i) => (
            <div key={d.toISOString()} style={styles.allDayCell}>
              {allDayEvents[i].map(e => (
                <div key={e.id} style={{ ...styles.eventChip, background: e.color || e.calendar_color }} onClick={ev => { ev.stopPropagation(); onEventClick(e); }}>
                  {e.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={styles.weekBody}>
        <div style={styles.hoursCol}>
          {HOURS.map(h => <div key={h} style={styles.hourLabel}>{h}:00</div>)}
        </div>
        {weekDays.map(d => {
          const timedEvents = eventsOnDay(d).filter(e => !e.all_day);
          return (
            <div key={d.toISOString()} style={styles.weekDayCol} onClick={() => { const h = new Date().getHours(); onDateClick(`${format(d,'yyyy-MM-dd')}T${String(h).padStart(2,'0')}:00`); }}>
              {HOURS.map(h => <div key={h} style={styles.hourCell} />)}
              {timedEvents.map(e => <TimedEvent key={e.id} event={e} dayStart={startOfDay(d)} onClick={() => onEventClick(e)} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ currentDate, filtered, onDateClick, onEventClick }: {
  currentDate: Date;
  filtered: CalendarEvent[];
  onDateClick: (date: string) => void;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const dayEvents = filtered.filter(e => {
    const start = parseISO(e.start_at);
    const end = parseISO(e.end_at);
    return areIntervalsOverlapping(
      { start: startOfDay(currentDate), end: endOfDay(currentDate) },
      { start, end }, { inclusive: true }
    );
  });
  const allDay = dayEvents.filter(e => e.all_day);
  const timed = dayEvents.filter(e => !e.all_day);

  return (
    <div style={styles.weekContainer}>
      <div style={styles.weekHeader}>
        <div style={{ width: 52, flexShrink: 0 }} />
        <div style={{ ...styles.weekDayHeader, flex: 1 }} onClick={() => onDateClick(format(currentDate, 'yyyy-MM-dd'))}>
          <span style={styles.weekDayLabel}>{DAYS[currentDate.getDay()]}</span>
          <span style={{ ...styles.weekDayNum, ...(isToday(currentDate) ? styles.todayNum : {}) }}>{format(currentDate, 'd')}</span>
        </div>
      </div>
      {allDay.length > 0 && (
        <div style={styles.allDayRow}>
          <div style={{ width: 52, flexShrink: 0, fontSize: 10, color: '#94a3b8', textAlign: 'right', paddingRight: 8, paddingTop: 4 }}>終日</div>
          <div style={{ ...styles.allDayCell, flex: 1 }}>
            {allDay.map(e => <div key={e.id} style={{ ...styles.eventChip, background: e.color || e.calendar_color }} onClick={() => onEventClick(e)}>{e.title}</div>)}
          </div>
        </div>
      )}
      <div style={styles.weekBody}>
        <div style={styles.hoursCol}>
          {HOURS.map(h => <div key={h} style={styles.hourLabel}>{h}:00</div>)}
        </div>
        <div style={{ ...styles.weekDayCol, flex: 1 }} onClick={e => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const h = Math.floor((y / (HOURS.length * 48)) * 24);
          onDateClick(`${format(currentDate,'yyyy-MM-dd')}T${String(h).padStart(2,'0')}:00`);
        }}>
          {HOURS.map(h => <div key={h} style={styles.hourCell} />)}
          {timed.map(e => <TimedEvent key={e.id} event={e} dayStart={startOfDay(currentDate)} onClick={() => onEventClick(e)} />)}
        </div>
      </div>
    </div>
  );
}

function TimedEvent({ event, dayStart, onClick }: { event: CalendarEvent; dayStart: Date; onClick: () => void }) {
  const HOUR_HEIGHT = 48;
  const start = parseISO(event.start_at);
  const end = parseISO(event.end_at);
  const startMins = Math.max(0, (start.getTime() - dayStart.getTime()) / 60000);
  const endMins = Math.min(24 * 60, (end.getTime() - dayStart.getTime()) / 60000);
  const top = (startMins / 60) * HOUR_HEIGHT;
  const height = Math.max(20, ((endMins - startMins) / 60) * HOUR_HEIGHT - 2);

  return (
    <div
      style={{
        position: 'absolute', left: 2, right: 2, top, height,
        background: event.color || event.calendar_color,
        borderRadius: 4, padding: '2px 6px',
        color: '#fff', fontSize: 11, fontWeight: 600,
        overflow: 'hidden', cursor: 'pointer', zIndex: 1,
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {event.title}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' },
  navGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  navBtn: { border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 14, color: '#334155' },
  dateTitle: { fontSize: 18, fontWeight: 700, color: '#1e293b', marginLeft: 8 },
  viewBtns: { display: 'flex', gap: 4 },
  viewBtn: { border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 14, color: '#334155' },
  viewBtnActive: { background: '#eff6ff', borderColor: '#3b82f6', color: '#2563eb', fontWeight: 700 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1, overflow: 'auto' },
  dayHeader: { padding: '8px 0', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' },
  dayCell: { border: '1px solid #f1f5f9', padding: '4px 6px', minHeight: 90, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 },
  otherMonth: { background: '#f8fafc', opacity: 0.5 },
  dayNum: { fontSize: 13, fontWeight: 500, color: '#334155', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' },
  todayNum: { background: '#3b82f6', color: '#fff', fontWeight: 700 },
  eventList: { display: 'flex', flexDirection: 'column', gap: 1 },
  eventChip: { borderRadius: 3, padding: '1px 6px', fontSize: 11, fontWeight: 600, color: '#fff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  moreChip: { fontSize: 11, color: '#64748b', paddingLeft: 6 },
  weekContainer: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  weekHeader: { display: 'flex', borderBottom: '1px solid #e2e8f0' },
  weekDayHeader: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', cursor: 'pointer', gap: 2 },
  weekDayLabel: { fontSize: 11, color: '#64748b', fontWeight: 600 },
  weekDayNum: { fontSize: 20, fontWeight: 500, color: '#1e293b', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' },
  allDayRow: { display: 'flex', borderBottom: '1px solid #e2e8f0', minHeight: 28, background: '#f8fafc' },
  allDayCell: { flex: 1, padding: '2px 4px', display: 'flex', flexDirection: 'column', gap: 1 },
  weekBody: { flex: 1, display: 'flex', overflow: 'auto' },
  hoursCol: { width: 52, flexShrink: 0, display: 'flex', flexDirection: 'column' },
  hourLabel: { height: 48, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8, fontSize: 10, color: '#94a3b8', borderTop: '1px solid #f1f5f9' },
  weekDayCol: { flex: 1, position: 'relative', borderLeft: '1px solid #f1f5f9' },
  hourCell: { height: 48, borderTop: '1px solid #f1f5f9' },
};
