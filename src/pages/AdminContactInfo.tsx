import { useState, useEffect } from 'react';

interface ContactInfo {
  phone: string;
  email: string;
  website: string;
  whatsapp: string;
  support_message: string;
}

export default function AdminContactInfo() {
  const [info, setInfo] = useState<ContactInfo>({ phone: '', email: '', website: '', whatsapp: '', support_message: '' });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/admin/api/contact', { credentials: 'include' })
      .then(r => r.json())
      .then(setInfo);
  }, []);

  async function save() {
    const res = await fetch('/admin/api/contact', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  const fields: { key: keyof ContactInfo; label: string; placeholder: string; multiline?: boolean }[] = [
    { key: 'phone', label: 'Phone', placeholder: '+96170449900' },
    { key: 'email', label: 'Email', placeholder: 'Adarwich@engineer.com' },
    { key: 'website', label: 'Website', placeholder: 'Technodel.Tech' },
    { key: 'whatsapp', label: 'WhatsApp', placeholder: '+96170449900' },
    { key: 'support_message', label: 'Support Message', placeholder: 'We\'re here to help! Reach out anytime.', multiline: true },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>📞 Contact Info</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        This information is shown to users on the Contact Us page.
      </p>

      <div className="card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
              {f.multiline ? (
                <textarea
                  value={info[f.key]}
                  onChange={e => setInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                />
              ) : (
                <input
                  value={info[f.key]}
                  onChange={e => setInfo(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-primary" onClick={save}>
              {saved ? '✓ Saved!' : '💾 Save Contact Info'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
