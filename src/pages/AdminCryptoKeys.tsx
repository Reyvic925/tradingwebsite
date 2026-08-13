import React, { useEffect, useState } from 'react';

export default function AdminCryptoKeys() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ id: any; privateKey: string | null; mnemonic: string | null } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');

  async function fetchList() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/crypto-addresses');
      const j = await res.json();
      setRows(j?.data || []);
    } catch (e) {
      console.error(e);
      alert('Failed to load addresses: ' + (e as any)?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); }, []);

  async function reveal(id: any) {
    setRevealing(true);
    try {
      const headers: any = {};
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const res = await fetch(`/api/admin/crypto-addresses/${id}/decrypt`, { headers });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Reveal failed');
      setModal({ id, privateKey: j?.privateKey || null, mnemonic: j?.mnemonic || null });
    } catch (e) {
      alert('Reveal error: ' + (e as any)?.message || String(e));
    } finally {
      setRevealing(false);
    }
  }

  function copyToClipboard(v: string | null) {
    if (!v) return;
    navigator.clipboard?.writeText(v).then(() => alert('Copied to clipboard'));
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin Crypto Addresses</h2>

      <div style={{ marginBottom: 12 }}>
        <label>Optional admin secret (x-admin-secret header): </label>
        <input value={adminSecret} onChange={(e) => setAdminSecret(e.target.value)} style={{ width: '40%' }} />
        <button onClick={() => fetchList()} style={{ marginLeft: 8 }} disabled={loading}>Refresh</button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Currency</th>
              <th>Address</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #ddd' }}>
                <td>{r.id}</td>
                <td>{r.user_id}</td>
                <td>{r.currency}</td>
                <td>{r.address}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                <td>
                  <button onClick={() => reveal(r.id)} disabled={revealing}>Reveal Keys</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal ? (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: 20, width: '640px', maxWidth: '95%' }}>
            <h3>Decrypted Keys for Address ID {modal.id}</h3>
            <p style={{ color: '#a00' }}><strong>Warning:</strong> Private keys and mnemonics are extremely sensitive. Only copy/store them in a secure environment. This action is audited.</p>
            <div style={{ marginTop: 12 }}>
              <div>
                <label>Private Key</label>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>{modal.privateKey || '<none>'}</pre>
                <button onClick={() => copyToClipboard(modal.privateKey)}>Copy Private Key</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <label>Mnemonic</label>
                <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 8 }}>{modal.mnemonic || '<none>'}</pre>
                <button onClick={() => copyToClipboard(modal.mnemonic)}>Copy Mnemonic</button>
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 20 }}>
        <small>
          Note: This page requires admin access. The frontend will attempt to use the user's session Authorization header by default. You can optionally provide x-admin-secret if your deployment uses the ADMIN_SECRET header for admin API access.
        </small>
      </div>
    </div>
  );
}
