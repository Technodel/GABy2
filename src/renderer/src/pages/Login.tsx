import { useState, useEffect } from 'react';

interface LoginProps {
  onLogin: (role: 'admin' | 'user') => void;
}

interface PricingMode {
  mode: string;
  display_name: string;
  description: string;
  input_token_base_cost: number;
  output_token_base_cost: number;
}

interface ContactInfo {
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  support_message: string;
}

function fmtCost(cost: number): string {
  if (!cost || isNaN(cost)) return '—';
  if (cost === 0) return 'free';
  const perM = cost * 1_000_000;
  return `$${perM < 1 ? perM.toFixed(4) : perM.toFixed(2)}`;
}

export default function Login({ onLogin }: LoginProps) {
  const [tab, setTab] = useState<'user' | 'admin' | 'signup'>('user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [signupName, setSignupName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState<PricingMode[]>([]);
  const [contact, setContact] = useState<ContactInfo | null>(null);

  useEffect(() => {
    fetch('/api/pricing-public').then(r => r.ok ? r.json() : []).then(d => { if (Array.isArray(d)) setPricing(d); }).catch(() => {});
    fetch('/api/contact').then(r => r.ok ? r.json() : null).then(d => { if (d) setContact(d); }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (tab === 'signup') {
      if (signupPassword !== signupConfirm) { setError('Passwords do not match.'); setLoading(false); return; }
      try {
        const res = await fetch('/api/register', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: signupUsername, password: signupPassword, display_name: signupName || undefined }),
        });
        const data = await res.json();
        if (res.ok && data.success) { onLogin('user'); }
        else { setError(data.error || 'Registration failed. Please try again.'); }
      } catch { setError('Unable to connect. Please check your connection.'); }
      setLoading(false);
      return;
    }

    const endpoint = tab === 'admin' ? '/admin/login' : '/api/login';
    const body = tab === 'admin' ? { password } : { username, password };
    try {
      const res = await fetch(endpoint, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onLogin(tab === 'admin' ? 'admin' : 'user');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Unable to connect. Please check your connection.');
    }
    setLoading(false);
  }

  const modeIcons: Record<string, string> = { free: '⚡', fast: '🚀', pro: '🧠' };

  const features = [
    { icon: '01', title: 'One-Click Ship Mode', desc: 'Give one goal and SUNy plans, edits, runs checks, and ships a verified result end-to-end.' },
    { icon: '02', title: 'Proof Panel', desc: 'Every task shows proof: files changed, checks run, pass/fail status, and what was fixed.' },
    { icon: '03', title: 'Live Execution Timeline', desc: 'Watch SUNy work in real time: planning, editing, testing, fixing, and final delivery.' },
    { icon: '04', title: 'Checkpoint Rollback', desc: 'Each turn is checkpointed so you can instantly restore any previous working state.' },
    { icon: '05', title: 'Adaptive Intelligence Routing', desc: 'SUNy routes simple tasks to fast paths and complex work to deep reasoning for better speed and quality.' },
    { icon: '06', title: 'Verification-First Engine', desc: 'Before final answers, SUNy validates changes with lint, tests, and focused re-check loops.' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes revealUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-reveal { opacity: 0; animation: revealUp 420ms ease forwards; }
        .landing-reveal-1 { animation-delay: 80ms; }
        .landing-reveal-2 { animation-delay: 150ms; }
        .landing-reveal-3 { animation-delay: 220ms; }

        @keyframes loginCardGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(41,255,122,0.0), var(--shadow); }
          50% { box-shadow: 0 0 18px 4px rgba(41,255,122,0.12), 0 0 40px 10px rgba(41,255,122,0.05), var(--shadow); }
        }
        .login-card-glow { animation: loginCardGlow 4s ease-in-out infinite; }
        @keyframes heroOrb {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.22; }
          33% { transform: translate(30px, -40px) scale(1.15); opacity: 0.32; }
          66% { transform: translate(-20px, 20px) scale(0.9); opacity: 0.18; }
        }
        .login-orb { animation: heroOrb 9s ease-in-out infinite; pointer-events: none; position: absolute; border-radius: 50%; filter: blur(60px); }
        @keyframes heroPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(41,255,122,0); }
          50% { box-shadow: 0 0 40px 12px rgba(41,255,122,0.12), 0 0 80px 30px rgba(41,255,122,0.05); }
        }
        .hero-logo-glow { animation: heroPulse 3.5s ease-in-out infinite; }

        .login-main-grid {
          flex: 1;
          display: flex;
          gap: 28px;
          padding: 40px 48px 64px;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
          align-items: flex-start;
        }
        .login-how-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }

        @media (max-width: 1140px) {
          .login-main-grid {
            flex-direction: column;
            padding: 32px 20px 48px;
            gap: 22px;
          }
          .login-main-grid > div {
            width: 100% !important;
            max-width: 100%;
          }
        }

        @media (max-width: 760px) {
          .login-how-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '48px 20px 36px', background: 'linear-gradient(180deg, rgba(41,255,122,0.06) 0%, transparent 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Floating glow orbs */}
        <div className="login-orb" style={{ width: 300, height: 300, background: 'radial-gradient(circle, rgba(41,255,122,0.25) 0%, transparent 70%)', top: -50, left: '15%' }} />
        <div className="login-orb" style={{ width: 200, height: 200, background: 'radial-gradient(circle, rgba(41,255,122,0.2) 0%, transparent 70%)', top: 20, right: '10%', animationDelay: '3s' }} />
        <div className="login-orb" style={{ width: 150, height: 150, background: 'radial-gradient(circle, rgba(41,255,122,0.15) 0%, transparent 70%)', bottom: -20, left: '40%', animationDelay: '6s' }} />
        <img src="/SLOGO.png" alt="SUNy" className="hero-logo-glow" style={{ width: 220, height: 220, borderRadius: 10, objectFit: 'cover', margin: '0 auto 24px', display: 'block', boxShadow: '0 0 0 1px rgba(41,255,122,0.22), 0 24px 60px rgba(0,0,0,0.35)', filter: 'grayscale(0.12) contrast(1.04)', position: 'relative', zIndex: 1 }} />
        <div className="landing-reveal landing-reveal-1" style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, position: 'relative', zIndex: 1 }}>Local AI terminal</div>
        <h1 className="landing-reveal landing-reveal-1" style={{ fontSize: 52, fontWeight: 800, marginBottom: 10, letterSpacing: '-1px', position: 'relative', zIndex: 1 }}>SUNy</h1>
        <p className="landing-reveal landing-reveal-2" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)', marginBottom: 14, position: 'relative', zIndex: 1 }}>Operator mode for real projects.</p>
        <p className="landing-reveal landing-reveal-3" style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 720, margin: '0 auto', lineHeight: 1.75, position: 'relative', zIndex: 1 }}>
          A serious local AI workspace for building, debugging, and shipping. Give SUNy a task, let it inspect the project, and watch it execute with the discipline of a terminal session.
        </p>
      </div>

      {/* 3-column: Pricing | Sign In | What is SUNy */}
        {/* Badge strip */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', padding: '18px 24px 0', fontSize: 12, color: 'var(--text-muted)' }}>
          {['🔧 Works on any tech stack', '📁 Reads your whole project', '🔄 Retries until done', '📋 Proof with every result', '🔒 Your code stays yours'].map(b => (
            <span key={b} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>{b}</span>
          ))}
        </div>

        {/* How it works */}
        <div className="landing-reveal landing-reveal-1" style={{ maxWidth: 1000, margin: '36px auto 0', padding: '0 48px' }}>
          <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, marginBottom: 28, color: 'var(--text-primary)' }}>How it works</h2>
          <div className="login-how-grid">
            {[
              { step: '01', title: 'Tell SUNy your goal', desc: 'Type what you want in plain English — no commands, no setup, no manual file selection.' },
              { step: '02', title: 'SUNy reads the project', desc: 'It maps your codebase, finds the relevant files, and builds a plan before touching anything.' },
              { step: '03', title: 'SUNy executes + verifies', desc: 'It writes code, runs lint and tests, checks outputs, and fixes problems automatically.' },
              { step: '04', title: 'You get proof', desc: 'A full report shows what changed, what ran, what passed — and gives you a rollback checkpoint.' },
            ].map(s => (
              <div key={s.step} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 16px', position: 'relative' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: 8 }}>{s.step}</div>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, lineHeight: 1.35 }}>{s.title}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3-column: Pricing | Sign In | What is SUNy */}
        <div className="login-main-grid">

        {/* LEFT: Pricing */}
        <div className="landing-reveal landing-reveal-1" style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Pricing</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            No subscriptions. Pay only when SUNy does real work.
          </p>
          {pricing.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {pricing.map(m => (
                <div key={m.mode} className="card login-card-glow" style={{ border: m.mode === 'pro' ? '1px solid var(--accent)' : '1px solid var(--border)', animationDelay: `${pricing.indexOf(m) * 1.2}s` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, minWidth: 28 }}>{modeIcons[m.mode] ?? '00'}</span>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{m.display_name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>{m.description}</div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                    <div><span style={{ color: 'var(--text-muted)' }}>Input: </span><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtCost(m.input_token_base_cost)}/1M</span></div>
                    <div><span style={{ color: 'var(--text-muted)' }}>Output: </span><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmtCost(m.output_token_base_cost)}/1M</span></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading pricing…</div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 8 }}>Why This Pricing Model</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 8 }}>
              Credits align cost with outcomes: tiny tasks stay tiny, larger delivery stays transparent, and inactive periods cost you nothing.
            </p>
            <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span>• No monthly lock-in or idle billing.</span>
              <span>• Live balance visibility before and after every task.</span>
              <span>• Built for teams that value predictable execution spend.</span>
            </div>
          </div>
        </div>

        {/* CENTER: Sign In */}
        <div className="landing-reveal landing-reveal-2" style={{ width: 360, flexShrink: 0 }}>
          <div className="card">
            <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
              {(['user', 'signup', 'admin'] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setError(''); }}
                  style={{ flex: 1, padding: '8px 0', background: 'none', border: 'none',
                    borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
                    color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 500, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                    transition: 'all 0.15s', marginBottom: -1 }}>
                  {t === 'user' ? 'Sign In' : t === 'signup' ? 'Sign Up' : 'Admin'}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit}>
              {tab === 'signup' && (<>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Your Name <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(optional)</span></label>
                  <input type="text" value={signupName} onChange={e => setSignupName(e.target.value)}
                    placeholder="e.g. Alex" autoComplete="name" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Username</label>
                  <input type="text" value={signupUsername} onChange={e => setSignupUsername(e.target.value)}
                    placeholder="letters, numbers, underscores" autoComplete="username" required />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Password</label>
                  <input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
                    placeholder="Minimum 6 characters" autoComplete="new-password" required />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Confirm Password</label>
                  <input type="password" value={signupConfirm} onChange={e => setSignupConfirm(e.target.value)}
                    placeholder="Repeat password" autoComplete="new-password" required />
                </div>
              </>)}
              {tab === 'user' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Username</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="Your username" autoComplete="username" required />
                </div>
              )}
              {(tab === 'user' || tab === 'admin') && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: 'var(--text-secondary)' }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={tab === 'admin' ? 'Admin password' : 'Your password'} autoComplete="current-password" required />
                </div>
              )}
              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(248,113,113,0.1)',
                  border: '1px solid var(--error)', color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? (tab === 'signup' ? 'Creating account...' : 'Signing in...') : (tab === 'signup' ? 'Create Account' : 'Sign in')}
              </button>
            </form>
          </div>
          {contact && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Need help? Contact us</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {contact.email && <a href={`mailto:${contact.email}`} className="btn btn-secondary" style={{ fontSize: 12 }}>{contact.email}</a>}
                {contact.phone && <a href={`tel:${contact.phone}`} className="btn btn-secondary" style={{ fontSize: 12 }}>{contact.phone}</a>}
                {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: 12 }}>💬 WhatsApp</a>}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            Start in under 60 seconds. No setup wizard required.
          </div>
        </div>

        {/* RIGHT: What is SUNy */}
        <div className="landing-reveal landing-reveal-3" style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>Why SUNy?</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            Not another chat box. SUNy is an execution system built to finish work with visible proof and reliable outcomes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {features.map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 4, width: 28, color: 'var(--accent)', fontWeight: 700 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <a
            href="/what-is-suny"
            className="btn btn-secondary"
            style={{ marginTop: 16, width: '100%', justifyContent: 'center', textDecoration: 'none' }}
          >
            Read: What is SUNy?
          </a>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <a href="/about" className="btn btn-secondary" style={{ textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
              About SUNy
            </a>
            <a href="/contact" className="btn btn-secondary" style={{ textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
              Contact Team
            </a>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', fontSize: 13, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
        SUNy — Consider it done! &nbsp;&middot;&nbsp; &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}