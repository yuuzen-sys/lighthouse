import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Calendar, CalendarMember } from '../types';

interface Props {
  calendar: Calendar;
  onClose: () => void;
  onChanged: () => void;
}

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

export default function CalendarManager({ calendar, onClose, onChanged }: Props) {
  const [name, setName] = useState(calendar.name);
  const [color, setColor] = useState(calendar.color);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.calendars.members(calendar.id).then(d => setMembers(d.members));
  }, [calendar.id]);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.calendars.update(calendar.id, { name, color });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー');
    }
  }

  async function handleGenerateLink() {
    setError(''); setInviteLink('');
    try {
      const { token } = await api.invitations.create(calendar.id, inviteRole);
      const url = `${window.location.origin}/?invite=${token}`;
      setInviteLink(url);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー');
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemove(userId: string) {
    if (!confirm('このメンバーを削除しますか？')) return;
    try {
      await api.calendars.removeMember(calendar.id, userId);
      setMembers(m => m.filter(x => x.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー');
    }
  }

  async function handleDelete() {
    if (!confirm(`「${calendar.name}」を削除しますか？この操作は元に戻せません。`)) return;
    try {
      await api.calendars.delete(calendar.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラー');
    }
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>カレンダー設定</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleUpdate} style={styles.section}>
          <label style={styles.label}>カレンダー名</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} required />
          <label style={styles.label}>カラー</label>
          <div style={styles.colorRow}>
            {COLORS.map(c => (
              <button key={c} type="button" style={{ ...styles.colorDot, background: c, outline: color === c ? '3px solid #1e293b' : 'none' }} onClick={() => setColor(c)} />
            ))}
          </div>
          <button style={styles.saveBtn} type="submit">保存</button>
        </form>

        <div style={styles.divider} />
        <div style={styles.section}>
          <h3 style={styles.subtitle}>メンバー管理</h3>
          {members.map(m => (
            <div key={m.id} style={styles.memberRow}>
              <div style={{ ...styles.avatar, background: m.color }}>{m.name[0]}</div>
              <div style={styles.memberInfo}>
                <span style={styles.memberName}>{m.name}</span>
                <span style={styles.memberEmail}>{m.email}</span>
              </div>
              <span style={styles.roleBadge}>{m.role === 'owner' ? 'オーナー' : m.role === 'editor' ? '編集者' : '閲覧者'}</span>
              {m.role !== 'owner' && (
                <button style={styles.removeBtn} onClick={() => handleRemove(m.id)}>✕</button>
              )}
            </div>
          ))}

          <div style={styles.inviteForm}>
            <h4 style={styles.inviteTitle}>招待リンクを生成</h4>
            <select style={styles.select} value={inviteRole} onChange={e => setInviteRole(e.target.value as 'editor' | 'viewer')}>
              <option value="viewer">閲覧者（見るだけ）</option>
              <option value="editor">編集者（追加・編集可）</option>
            </select>
            <button style={styles.inviteBtn} type="button" onClick={handleGenerateLink}>
              リンクを生成する
            </button>
            {inviteLink && (
              <div style={styles.linkBox}>
                <span style={styles.linkText}>{inviteLink}</span>
                <button style={{ ...styles.copyBtn, ...(copied ? styles.copiedBtn : {}) }} onClick={handleCopy}>
                  {copied ? 'コピー済み ✓' : 'コピー'}
                </button>
              </div>
            )}
            <p style={styles.inviteNote}>※ リンクは7日間有効です。名前だけで参加できます。</p>
          </div>
        </div>

        {!calendar.is_default && (
          <>
            <div style={styles.divider} />
            <div style={styles.section}>
              <button style={styles.deleteBtn} onClick={handleDelete}>このカレンダーを削除</button>
            </div>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 16, width: 440, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' },
  title: { fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b' },
  closeBtn: { border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94a3b8' },
  section: { padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 13, fontWeight: 600, color: '#64748b' },
  input: { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 },
  select: { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14 },
  colorRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  colorDot: { width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', outlineOffset: 3 },
  saveBtn: { padding: '9px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start', paddingLeft: 20, paddingRight: 20 },
  divider: { height: 1, background: '#f1f5f9' },
  subtitle: { fontSize: 15, fontWeight: 700, margin: 0, color: '#1e293b' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' },
  avatar: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  memberInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 1 },
  memberName: { fontSize: 13, fontWeight: 600, color: '#1e293b' },
  memberEmail: { fontSize: 11, color: '#94a3b8' },
  roleBadge: { fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px', color: '#64748b', fontWeight: 600 },
  removeBtn: { border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 },
  inviteForm: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 8 },
  inviteTitle: { fontSize: 13, fontWeight: 700, margin: 0, color: '#64748b' },
  inviteBtn: { padding: '9px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  linkBox: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' },
  linkText: { flex: 1, fontSize: 11, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: { border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  copiedBtn: { background: '#10b981' },
  inviteNote: { margin: 0, fontSize: 11, color: '#94a3b8' },
  deleteBtn: { padding: '9px', background: '#fff', color: '#ef4444', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: 13, margin: '0 1.5rem 1rem', textAlign: 'center' },
};
