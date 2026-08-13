import React, { useState } from 'react';

export default function KycSubmit() {
  const [personalData, setPersonalData] = useState({ full_name: '', dob: '', address: '' });
  const [documents, setDocuments] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');

  // NOTE: Preferred upload flow: upload files directly to Supabase Storage from the browser
  // (using the client library and the logged-in user's anon key), then pass the public URLs
  // in the `documents` array below. For now this form accepts document URLs for quick testing.

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('Submitting...');
    try {
      const res = await fetch('/api/user/kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personal_data: personalData, documents }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Request failed');
      setStatus('Submitted. Awaiting review.');
    } catch (err: any) {
      setStatus('Error: ' + (err?.message || String(err)));
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>KYC Submission</h2>
      <form onSubmit={submit}>
        <div>
          <label>Full name</label>
          <input value={personalData.full_name} onChange={(e) => setPersonalData({ ...personalData, full_name: e.target.value })} />
        </div>
        <div>
          <label>Date of birth</label>
          <input value={personalData.dob} onChange={(e) => setPersonalData({ ...personalData, dob: e.target.value })} />
        </div>
        <div>
          <label>Address</label>
          <input value={personalData.address} onChange={(e) => setPersonalData({ ...personalData, address: e.target.value })} />
        </div>
        <div>
          <label>Document URLs (comma separated)</label>
          <input
            value={documents.join(',')}
            onChange={(e) => setDocuments(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          />
          <small>
            TODO: Replace with direct file upload to Supabase Storage and attach returned URLs here.
          </small>
        </div>
        <button type="submit">Submit KYC</button>
      </form>
      <div style={{ marginTop: 12 }}>{status}</div>
    </div>
  );
}
