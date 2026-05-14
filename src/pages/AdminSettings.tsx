import { useState, useEffect } from 'react';

interface Settings {
  allow_registration: boolean;
  dark_mode: boolean;
  prompt_caching_enabled: boolean;
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>({
    allow_registration: false,
    dark_mode: true,
    prompt_caching_enabled: true,
  });
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    fetch('/admin/api/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(raw => setSettings(prev => ({
        ...prev,
        allow_registration: raw.allow_registration === 'true',
        dark_mode: raw.dark_mode === 'true',
        prompt_caching_enabled: raw.prompt_caching_enabled !== 'false',
      })));
  }, []);

  function toggle(key: keyof Settings) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function saveSettings() {
    const res = await fetch('/admin/api/settings', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  }

  async function changePassword() {
    setPwdError(''); setPwdSuccess('');
    if (newPwd !== confirmPwd) { setPwdError('Passwords do not match'); return; }
    if (newPwd.length < 6) { setPwdError('Password must be at least 6 characters'); return; }
    const res = await fetch('/admin/api/settings/change-password', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
    });
    const data = await res.json();
    if (res.ok) {
      setPwdSuccess('Password changed successfully');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } else {
      setPwdError(data.error || 'Failed to change password');
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>âš™ï¸ Settings</h1>

      {/* General Settings */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>General</h3>

        {[
          { key: 'allow_registration' as const, label: 'Allow New User Registration', desc: 'When off, only admin can create users.' },
          { key: 'dark_mode' as const, label: 'Default Dark Mode', desc: 'Default appearance for new users.' },
          { key: 'prompt_caching_enabled' as const, label: 'ðŸ§  Prompt Caching', desc: 'Caches static context (system prompt, project map, open files) to cut input costs by up to 90% on repeat turns. Works with all supported models.' },
        ].map(s => (
          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{s.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
            </div>
            <input type="checkbox" className="toggle" checked={settings[s.key]} onChange={() => toggle(s.key)} />
          </div>
        ))}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={saveSettings}>
            {settingsSaved ? 'âœ“ Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Change Admin Password */}
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: 16 }}>ðŸ” Change Admin Password</h3>

        {pwdError && <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{pwdError}</div>}
        {pwdSuccess && <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 12, padding: '8px 12px', background: 'rgba(34,197,94,0.1)', borderRadius: 6 }}>{pwdSuccess}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Current Password</label>
            <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Enter current password" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>New Password</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 6 chars)" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Confirm New Password</label>
            <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Confirm new password" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={changePassword}>Change Password</button>
          </div>
        </div>
      </div>
    </div>
  );
}
