import { useState, useEffect, useRef } from 'react';
import { CreditCard, Wallet } from 'lucide-react';

interface BalanceBadgeProps {
  balance: number;
  walletBalance: number;
}

/**
 * Format a dollar amount in cents-granularity like Aider.
 * Shows 4 decimal places for small amounts (e.g., $0.0042), 2 for larger ones.
 */
function formatCents(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `¢${(amount * 100).toFixed(2)}`;  // Show as cents when < 1¢
  if (amount < 1) return `$${amount.toFixed(4)}`;  // 4 decimal places for sub-dollar
  if (amount < 10) return `$${amount.toFixed(3)}`;  // 3 for single digits
  return `$${amount.toFixed(2)}`;  // 2 for larger amounts
}

// Shows balances in cents-granularity — no breakdown, no token counts
export default function BalanceBadge({ balance, walletBalance }: BalanceBadgeProps) {
  const prevWallet = useRef<number | null>(null);
  const prevBalance = useRef<number | null>(null);
  const [walletFlash, setWalletFlash] = useState<'down' | 'up' | null>(null);
  const [balanceFlash, setBalanceFlash] = useState<'down' | 'up' | null>(null);
  const [walletDelta, setWalletDelta] = useState<number | null>(null);
  const [balanceDelta, setBalanceDelta] = useState<number | null>(null);

  useEffect(() => {
    if (prevWallet.current === null) { prevWallet.current = walletBalance; return; }
    const delta = walletBalance - prevWallet.current;
    if (delta !== 0) {
      setWalletDelta(delta);
      setWalletFlash(delta < 0 ? 'down' : 'up');
      setTimeout(() => { setWalletFlash(null); setWalletDelta(null); }, 2000);
    }
    prevWallet.current = walletBalance;
  }, [walletBalance]);

  useEffect(() => {
    if (prevBalance.current === null) { prevBalance.current = balance; return; }
    const delta = balance - prevBalance.current;
    if (delta !== 0) {
      setBalanceDelta(delta);
      setBalanceFlash(delta < 0 ? 'down' : 'up');
      setTimeout(() => { setBalanceFlash(null); setBalanceDelta(null); }, 2000);
    }
    prevBalance.current = balance;
  }, [balance]);

  const walletLow = walletBalance > 0 && walletBalance < 0.05;  // < 5¢ warning threshold
  const walletEmpty = walletBalance <= 0;
  const walletFormatted = formatCents(walletBalance);
  const balanceFormatted = formatCents(balance);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Wallet (bot fuel tank) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: walletEmpty ? 'rgba(239,68,68,0.1)' : 'var(--surface)',
        border: `1px solid ${walletEmpty ? 'var(--error)' : walletLow ? 'var(--warning)' : 'var(--border)'}`,
        fontSize: 13,
        fontWeight: 500,
        color: walletEmpty ? 'var(--error)' : walletLow ? 'var(--warning)' : 'inherit',
        transition: 'background 0.3s, color 0.3s',
        outline: walletFlash ? `2px solid ${walletFlash === 'down' ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)'}` : 'none',
      }} title="Bot Wallet — dedicated credits for AI tasks">
        <Wallet size={14} />
        <span>{walletFormatted}</span>
        {walletDelta !== null && (
          <span style={{ fontSize: 11, color: walletDelta < 0 ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)', marginLeft: 2 }}>
            {walletDelta < 0 ? `−${formatCents(-walletDelta)}` : `+${formatCents(walletDelta)}`}
          </span>
        )}
      </div>

      {/* Main credits */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-muted)',
        transition: 'background 0.3s',
        outline: balanceFlash ? `2px solid ${balanceFlash === 'down' ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)'}` : 'none',
      }}>
        <CreditCard size={14} />
        <span>{balanceFormatted}</span>
        {balanceDelta !== null && (
          <span style={{ fontSize: 11, color: balanceDelta < 0 ? 'var(--error, #ef4444)' : 'var(--success, #22c55e)', marginLeft: 2 }}>
            {balanceDelta < 0 ? `−${formatCents(-balanceDelta)}` : `+${formatCents(balanceDelta)}`}
          </span>
        )}
      </div>
    </div>
  );
}
