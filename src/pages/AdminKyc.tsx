import React, { useEffect, useState } from 'react';

export default function AdminKyc() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  async function fetchList() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/kyc');
      const j = await res.json();
      setSubmissions(j?.submissions || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function review(id: number, action: 'approve' | 'reject') {
    try {
      const res = await fetch('/api/admin/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, admin_notes: note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Review failed');
      // Refresh list
      fetchList();
      setNote('');
    } catch (e) {
      alert('Review error: ' + (e as any)?.message || String(e));
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Admin KYC Review</h2>
      <div>
        <label>Admin note (applies to next action)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '60%' }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => fetchList()} disabled={loading}>Refresh</button>
      </div>
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Status</th>
                <th>Submitted At</th>
                <th>Personal Data</th>
                <th>Documents</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid #ddd' }}>
                  <td>{s.id}</td>
                  <td>{s.user_id}</td>
                  <td>{s.status}</td>
                  <td>{new Date(s.submitted_at).toLocaleString()}</td>
                  <td><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(s.personal_data, null, 2)}</pre></td>
                  <td>{Array.isArray(s.documents) ? s.documents.map((d: any, i: number) => <div key={i}><a href={typeof d === 'string' ? d : d.url} target="_blank" rel="noreferrer">doc#{i+1}</a></div>) : null}</td>
                  <td>
                    <button onClick={() => review(s.id, 'approve')}>Approve</button>
                    <button onClick={() => review(s.id, 'reject')} style={{ marginLeft: 8 }}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <small>
          TODO: Wire admin auth (ensure Authorization or x-admin-secret header is sent). This page is a simple scaffold; integrate into the admin UI and styling as needed.
        </small>
      </div>
    </div>
  );
}
