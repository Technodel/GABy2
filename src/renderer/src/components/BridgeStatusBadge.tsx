interface BridgeStatusBadgeProps {
  connected: boolean;
  onClick?: () => void;
}

export default function BridgeStatusBadge({ connected, onClick }: BridgeStatusBadgeProps) {
  if (connected) {
    return (
      <button
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          fontSize: 12, color: 'var(--success)', cursor: 'pointer',
          transition: 'background 0.15s', fontFamily: 'inherit',
        }}
        title="SUNy Bridge is connected"
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
        Bridge
      </button>
    );
  }

  // Offline — neutral invite, not an error
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 999,
        background: 'transparent', border: '1px dashed var(--border)',
        fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
        transition: 'all 0.15s', fontFamily: 'inherit',
      }}
      title="Connect the Bridge to unlock file editing & shell commands"
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
    >
      🔌 Bridge
    </button>
  );
}
