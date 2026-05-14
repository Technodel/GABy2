import { useState, useEffect } from 'react';

interface ContactInfo {
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  support_message: string;
}

export default function ContactUs() {
  const [info, setInfo] = useState<ContactInfo | null>(null);

  useEffect(() => {
    fetch('/api/contact', { credentials: 'include' })
      .then(r => r.json())
      .then(setInfo);
  }, []);

  if (!info) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 32 }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>📞 Contact Us</h1>
        {info.support_message && (
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
            {info.support_message}
          </p>
        )}

        <div className="card">
          {info.phone && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Phone</div>
              <a href={`tel:${info.phone}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                {info.phone}
              </a>
            </div>
          )}
          {info.email && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Email</div>
              <a href={`mailto:${info.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                {info.email}
              </a>
            </div>
          )}
          {info.website && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Website</div>
              <a href={`https://${info.website}`} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                {info.website}
              </a>
            </div>
          )}
          {info.whatsapp && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>WhatsApp</div>
              <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--success)', textDecoration: 'none' }}>
                {info.whatsapp}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
