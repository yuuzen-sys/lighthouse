import { useState, FormEvent } from 'react';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (name: string, email: string, password: string) => Promise<void>;
}

export default function AuthPage({ onLogin, onRegister }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onRegister(name, email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>📅 カレンダー</h1>
        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }} onClick={() => setMode('login')}>ログイン</button>
          <button style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }} onClick={() => setMode('register')}>新規登録</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <input style={styles.input} type="text" placeholder="名前" value={name} onChange={e => setName(e.target.value)} required />
          )}
          <input style={styles.input} type="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="パスワード" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' },
  card: { background: '#fff', borderRadius: 16, padding: '2.5rem 2rem', width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' },
  title: { textAlign: 'center', fontSize: 28, marginBottom: 24, color: '#1e293b' },
  tabs: { display: 'flex', gap: 8, marginBottom: 24 },
  tab: { flex: 1, padding: '8px 0', border: '2px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 15, color: '#64748b', fontWeight: 500 },
  tabActive: { borderColor: '#3b82f6', color: '#3b82f6', background: '#eff6ff' },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: { padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 15, outline: 'none' },
  button: { padding: '11px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  error: { color: '#ef4444', fontSize: 13, margin: 0 },
};
