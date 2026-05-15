import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';

interface Memory {
  id: number;
  content: string;
  created_at: string;
}

export default function MemoryManager() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => { loadMemories(); }, []);

  async function loadMemories() {
    const res = await fetch('/api/memories', { credentials: 'include' });
    if (res.ok) setMemories(await res.json());
  }

  async function addMemory() {
    if (!newText.trim()) return;
    setAdding(true);
    const res = await fetch('/api/memories', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newText.trim() }),
    });
    if (res.ok) { setNewText(''); loadMemories(); }
    setAdding(false);
  }

  async function deleteMemory(id: number) {
    await fetch(`/api/memories/${id}`, { method: 'DELETE', credentials: 'include' });
    setMemories(ms => ms.filter(m => m.id !== id));
  }

  async function clearAll() {
    await fetch('/api/memories', { method: 'DELETE', credentials: 'include' });
    setMemories([]);
    setConfirmClear(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600 }}>🧠 SUNy remembers...</span>
        {memories.length > 0 && !confirmClear && (
          <button className="btn btn-sm btn-danger" onClick={() => setConfirmClear(true)}>
            <Trash2 size={12} /> Clear All
          </button>
        )}
      </div>

      {confirmClear && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--error)' }}>
          <p style={{ marginBottom: 12, fontSize: 13 }}>
            Are you sure? SUNy will forget everything it learned about you.
            You can always teach it again! 😊
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger btn-sm" onClick={clearAll}>Yes, clear it</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>Keep my memories</button>
          </div>
        </div>
      )}

      {memories.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
          No memories yet. Add one below!
        </p>
      )}

      {memories.map(m => (
        <div key={m.id} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          borderBottom: '1px solid var(--border)',
          gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>• {m.content}</span>
          <button
            className="btn btn-icon btn-secondary btn-sm"
            onClick={() => deleteMemory(m.id)}
            title="Delete this memory"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          placeholder="e.g. I always use Tailwind for styling"
          onKeyDown={e => { if (e.key === 'Enter') addMemory(); }}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={addMemory}
          disabled={adding || !newText.trim()}
        >
          <Plus size={14} /> Save
        </button>
      </div>
    </div>
  );
}
