import { useState, useEffect } from 'react';
import { Flag, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react';

interface FeatureFlag {
  key: string;
  value: 'on' | 'off';
  label: string;
  description: string;
  updatedAt: string;
}

export default function AdminFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => { loadFlags(); }, []);

  async function loadFlags() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/admin/api/feature-flags', { credentials: 'include' });
      if (res.ok) setFlags(await res.json());
      else setError('Failed to load feature flags');
    } catch {
      setError('Network error loading feature flags');
    }
    setLoading(false);
  }

  async function toggleFlag(flag: FeatureFlag) {
    setToggling(flag.key);
    setError('');
    const newValue = flag.value === 'on' ? 'off' : 'on';
    try {
      const res = await fetch(`/admin/api/feature-flags/${flag.key}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newValue }),
      });
      if (res.ok) {
        setFlags(prev => prev.map(f =>
          f.key === flag.key ? { ...f, value: newValue as 'on' | 'off' } : f
        ));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to toggle flag');
      }
    } catch {
      setError('Network error toggling flag');
    }
    setToggling(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Flag size={20} style={{ color: 'var(--accent)' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Feature Flags</h2>
        <button className="btn btn-icon btn-secondary" onClick={loadFlags} title="Refresh" style={{ marginLeft: 'auto' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16, color: 'var(--text-primary)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading feature flags...</div>
      ) : flags.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, fontStyle: 'italic' }}>
          No feature flags defined yet. Flags are created automatically when first toggled.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {flags.map(flag => (
            <div
              key={flag.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <button
                className="btn btn-icon"
                onClick={() => toggleFlag(flag)}
                disabled={toggling === flag.key}
                title={`Turn ${flag.value === 'on' ? 'off' : 'on'}`}
                style={{
                  color: flag.value === 'on' ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: toggling === flag.key ? 'wait' : 'pointer',
                  background: 'none',
                  border: 'none',
                  padding: 4,
                }}
              >
                {flag.value === 'on' ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>{flag.key}</code>
                  <span style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: flag.value === 'on' ? 'rgba(34,197,94,0.15)' : 'rgba(100,100,100,0.15)',
                    color: flag.value === 'on' ? '#22c55e' : 'var(--text-secondary)',
                    fontWeight: 600,
                  }}>
                    {flag.value.toUpperCase()}
                  </span>
                </div>
                {flag.label && (
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 2 }}>{flag.label}</div>
                )}
                {flag.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{flag.description}</div>
                )}
                {flag.updatedAt && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, opacity: 0.6 }}>
                    Last updated: {flag.updatedAt}
                  </div>
                )}
              </div>
              {toggling === flag.key && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>...</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
