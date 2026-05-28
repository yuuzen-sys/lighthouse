import { useState, useEffect, FormEvent } from 'react';
import { api } from '../api/client';
import type { Calendar, CalendarEvent } from '../types';

interface Props {
  event?: CalendarEvent;
  defaultDate?: string;
  calendars: Calendar[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}

export default function EventModal({ event, defaultDate, calendars, onClose, onSaved, onDeleted }: Props) {
  const writableCalendars = calendars.filter(c => c.role === 'owner' || c.role === 'editor');
  const defaultCalId = writableCalendars[0]?.id || '';

  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [calendarId, setCalendarId] = useState(event?.calendar_id || defaultCalId);
  const [allDay, setAllDay] = useState(event ? Boolean(event.all_day) : false);
  const [startAt, setStartAt] = useState(() => {
    if (event) return event.start_at.slice(0, 16);
    const d = defaultDate ? new Date(defaultDate) : new Date();
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [endAt, setEndAt] = useState(() => {
    if (event) return event.end_at.slice(0, 16);
    const d = defaultDate ? new Date(defaultDate) : new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (allDay) {
      setStartAt(startAt.slice(0, 10));
      setEndAt(endAt.slice(0, 10));
    }
  }, [allDay]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const payload = {
        calendar_id: calendarId,
        title,
        description,
        start_at: allDay ? `${startAt}T00:00:00.000Z` : new Date(startAt).toISOString(),
        end_at: allDay ? `${endAt}T23:59:59.000Z` : new Date(endAt).toISOString(),
        all_day: allDay,
      };
      if (event) {
        await api.events.update(event.id, payload);
      } else {
        await api.events.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!event || !confirm('このイベントを削除しますか？')) return;
    try {
      await api.events.delete(event.id);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー');
    }
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>{event ? 'イベントを編集' : '新しいイベント'}</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.titleInput} value={title} onChange={e => setTitle(e.target.value)} placeholder="タイトル" required autoFocus />

          <div style={styles.row}>
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
              終日
            </label>
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>開始</label>
              <input style={styles.input} type={allDay ? 'date' : 'datetime-local'} value={startAt} onChange={e => setStartAt(e.target.value)} required />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>終了</label>
              <input style={styles.input} type={allDay ? 'date' : 'datetime-local'} value={endAt} onChange={e => setEndAt(e.target.value)} required />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>カレンダー</label>
            <select style={styles.input} value={calendarId} onChange={e => setCalendarId(e.target.value)} required>
              {writableCalendars.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>メモ</label>
            <textarea style={{ ...styles.input, minHeight: 72, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="任意" />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.footer}>
            {event && (
              <button type="button" style={styles.deleteBtn} onClick={handleDelete}>削除</button>
            )}
            <div style={styles.footerRight}>
              <button type="button" style={styles.cancelBtn} onClick={onClose}>キャンセル</button>
              <button type="submit" style={styles.saveBtn} disabled={loading}>
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 16, width: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title: { fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b' },
  closeBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' },
  form: { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 14 },
  titleInput: { padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 16, fontWeight: 600 },
  row: { display: 'flex', gap: 12, alignItems: 'center' },
  field: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  label: { fontSize: 12, fontWeight: 600, color: '#64748b' },
  input: { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' },
  checkLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: 13, margin: 0 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  footerRight: { display: 'flex', gap: 8, marginLeft: 'auto' },
  deleteBtn: { border: '1.5px solid #fecaca', background: '#fff', color: '#ef4444', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  cancelBtn: { border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 14 },
  saveBtn: { border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};
