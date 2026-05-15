import { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import MemoryManager from '../components/MemoryManager';

interface UserData {
  auto_approve: boolean;
  max_tokens_per_session: number | null;
  display_name: string | null;
}

interface UserSettingsProps {
  onBack: () => void;
  onLogout: () => void;
}

export default function UserSettings({ onBack, onLogout }: UserSettingsProps) {
  const [darkMode, setDarkMode] = useState(true);
  const [autoApprove, setAutoApprove] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [maxTokens, setMaxTokens] = useState<string>('');
  const [displayName, setDisplayName] = useState('');
  const [saved, setSaved] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then((data: UserData) => {
        setAutoApprove(data.auto_approve ?? true);
        if (data.max_tokens_per_session != null) {
          setMaxTokens(String(data.max_tokens_per_session));
        }
        setDisplayName(data.display_name ?? '');
      });
    const stored = localStorage.getItem('gaby_dark_mode');
    if (stored !== null) setDarkMode(stored !== 'false');
    const mem = localStorage.getItem('gaby_memory_enabled');
    if (mem !== null) setMemoryEnabled(mem !== 'false');
  }, []);

  async function saveSettings() {
    const parsed = parseInt(maxTokens, 10);
    await fetch('/api/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dark_mode: darkMode,
        auto_approve: autoApprove,
        memory_enabled: memoryEnabled,
        max_tokens_per_session: !isNaN(parsed) && parsed > 0 ? parsed : null,
      }),
    });
    localStorage.setItem('gaby_dark_mode', String(darkMode));
    localStorage.setItem('gaby_memory_enabled', String(memoryEnabled));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function saveName() {
    await fetch('/api/me/name', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: displayName.trim() || null }),
    });
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>⚙️ My Settings</h1>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 12 }}>👤 Your Name</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
            Optional — if set, GABy will call you by name during conversations.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={50}
              style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); }}
            />
            <button className="btn btn-primary btn-sm" onClick={saveName}>
              {nameSaved ? '✓ Saved!' : 'Save'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16 }}>🎨 Look & Feel</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>Dark Mode</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Easy on the eyes at night</div>
            </div>
            <input type="checkbox" className="toggle" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: 4 }}>✅ Auto-Approve GABy's Actions</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Let GABy work freely without asking for confirmation every step —
                it will keep you updated the whole time in plain English.
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle"
              checked={autoApprove}
              onChange={e => setAutoApprove(e.target.checked)}
              style={{ flexShrink: 0, marginLeft: 16 }}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 6 }}>🎯 Session Usage Limit</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
            Set a per-session maximum — leave blank to use the global limit.
            Useful if you want to keep tasks short and focused.
          </p>
          <input
            type="number"
            min={1000}
            step={1000}
            value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)}
            placeholder="Blank = use global default"
            style={{ maxWidth: 280 }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Controls how much work GABy can do in one conversation before pausing.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: 4 }}>🧠 GABy's Memory</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                Add notes that GABy always keeps in mind — like how you like your code,
                or things you want it to always or never do.
              </p>
            </div>
            <input
              type="checkbox"
              className="toggle"
              checked={memoryEnabled}
              onChange={e => setMemoryEnabled(e.target.checked)}
              style={{ flexShrink: 0, marginLeft: 16 }}
            />
          </div>
          {memoryEnabled && <MemoryManager />}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={saveSettings} style={{ flex: 1, justifyContent: 'center' }}>
            {saved ? '✓ Saved!' : '💾 Save Settings'}
          </button>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
