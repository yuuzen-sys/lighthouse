import { useState } from 'react';
import type { Calendar, User } from '../types';
import CalendarManager from './CalendarManager';
import { api } from '../api/client';

interface Props {
  user: User;
  calendars: Calendar[];
  visibleCalendars: Set<string>;
  onToggleCalendar: (id: string) => void;
  onCalendarsChange: () => void;
  onLogout: () => void;
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

export default function Sidebar({ user, calendars, visibleCalendars, onToggleCalendar, onCalendarsChange, onLogout }: Props) {
  const [managingCalendar, setManagingCalendar] = useState<Calendar | null>(null);
  const [showNewCalendar, setShowNewCalendar] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  async function createCalendar() {
    if (!newName.trim()) return;
    try {
      await api.calendars.create(newName, newColor);
      setNewName(''); setShowNewCalendar(false);
      onCalendarsChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラー');
    }
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.userSection}>
        <div style={{ ...styles.avatar, background: user.color }}>{user.name[0]}</div>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user.name}</span>
          <button style={styles.logoutBtn} onClick={onLogout}>ログアウト</button>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>マイカレンダー</span>
          <button style={styles.addBtn} onClick={() => setShowNewCalendar(v => !v)} title="カレンダーを追加">＋</button>
        </div>

        {showNewCalendar && (
          <div style={styles.newCalForm}>
            <input style={styles.calInput} value={newName} onChange={e => setNewName(e.target.value)} placeholder="カレンダー名" autoFocus />
            <div style={styles.colorRow}>
              {COLORS.map(c => (
                <button key={c} style={{ ...styles.colorDot, background: c, outline: newColor === c ? '2px solid #1e293b' : 'none' }} onClick={() => setNewColor(c)} />
              ))}
            </div>
            <div style={styles.formBtns}>
              <button style={styles.cancelBtn} onClick={() => setShowNewCalendar(false)}>キャンセル</button>
              <button style={styles.confirmBtn} onClick={createCalendar}>作成</button>
            </div>
          </div>
        )}

        {calendars.map(cal => (
          <div key={cal.id} style={styles.calRow}>
            <button
              style={{ ...styles.calCheck, background: visibleCalendars.has(cal.id) ? cal.color : 'transparent', border: `2px solid ${cal.color}` }}
              onClick={() => onToggleCalendar(cal.id)}
            >
              {visibleCalendars.has(cal.id) && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
            </button>
            <span style={styles.calName}>{cal.name}</span>
            {cal.role === 'owner' && (
              <button style={styles.settingBtn} onClick={() => setManagingCalendar(cal)} title="設定">⚙</button>
            )}
            <span style={{ ...styles.roleBadge, background: cal.role === 'owner' ? '#dbeafe' : '#f0fdf4', color: cal.role === 'owner' ? '#1d4ed8' : '#15803d' }}>
              {cal.role === 'owner' ? 'オーナー' : cal.role === 'editor' ? '編集者' : '閲覧者'}
            </span>
          </div>
        ))}
      </div>

      {managingCalendar && (
        <CalendarManager
          calendar={managingCalendar}
          onClose={() => setManagingCalendar(null)}
          onChanged={() => { setManagingCalendar(null); onCalendarsChange(); }}
        />
      )}
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: { width: 240, minWidth: 240, background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', overflowY: 'auto' },
  userSection: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 12px', borderBottom: '1px solid #f1f5f9' },
  avatar: { width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 },
  userInfo: { display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' },
  userName: { fontSize: 14, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn: { border: 'none', background: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer', padding: 0, textAlign: 'left' },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' },
  addBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: '0 4px' },
  calRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' },
  calCheck: { width: 18, height: 18, borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  calName: { flex: 1, fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  settingBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8', padding: 0 },
  roleBadge: { fontSize: 10, borderRadius: 4, padding: '1px 5px', fontWeight: 600 },
  newCalForm: { background: '#f8fafc', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  calInput: { padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 },
  colorRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  colorDot: { width: 20, height: 20, borderRadius: '50%', border: 'none', cursor: 'pointer', outlineOffset: 2 },
  formBtns: { display: 'flex', gap: 6, justifyContent: 'flex-end' },
  cancelBtn: { border: 'none', background: '#e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 },
  confirmBtn: { border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
};
