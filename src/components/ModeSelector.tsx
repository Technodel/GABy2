interface Mode {
  mode: string;
  display_name: string;
  description?: string;
  session_limit_label: string;
  has_active_key?: boolean;
}

interface ModeSelectorProps {
  modes: Mode[];
  selected: string;
  onChange: (mode: string) => void;
}

// Shows only friendly labels (⚡ Free Mode, 🚀 Fast Mode, 🧠 Pro Mode)
// Never shows model names, providers, or technical info
export default function ModeSelector({ modes, selected, onChange }: ModeSelectorProps) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {modes.map(m => {
        const disabled = m.has_active_key === false;
        return (
          <button
            key={m.mode}
            onClick={() => !disabled && onChange(m.mode)}
            title={disabled ? 'No active API key for this mode — ask your admin to add one' : (m.description || m.session_limit_label)}
            disabled={disabled}
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              border: `1px solid ${disabled ? 'var(--border)' : m.mode === selected ? 'var(--accent)' : 'var(--border)'}`,
              background: disabled ? 'transparent' : m.mode === selected ? 'rgba(108,99,255,0.15)' : 'var(--surface)',
              color: disabled ? 'var(--text-muted)' : m.mode === selected ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              transition: 'all 0.15s',
              fontFamily: 'inherit',
            }}
          >
            {m.display_name}{disabled ? ' 🔑' : ''}
          </button>
        );
      })}
    </div>
  );
}
