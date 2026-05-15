interface BridgeStatusBadgeProps {
  connected: boolean;
  onClick?: () => void;
}

// Shows only green/red dot — no IP, no port, no token info
export default function BridgeStatusBadge({ connected, onClick }: BridgeStatusBadgeProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 12,
        color: connected ? 'var(--success)' : 'var(--error)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
        fontFamily: 'inherit',
      }}
      title={connected ? 'GABy Bridge is connected' : 'GABy Bridge is offline — click to reconnect'}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: connected ? 'var(--success)' : 'var(--error)',
        flexShrink: 0,
      }} />
      {connected ? 'Bridge connected' : 'Bridge offline'}
    </button>
  );
}
