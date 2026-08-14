import { useEffect, useState, type FormEvent } from 'react';
import AppShell from '../components/AppShell';
import { apiGet, apiSend } from '../lib/api';

interface KycSubmission {
  id: number;
  user_id: string;
  personal_data: Record<string, any>;
  documents: string[];
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string;
  admin_notes?: string;
}

interface Profile {
  kyc_status: string;
}

export default function KycSubmit() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [documentUrls, setDocumentUrls] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const [p, subs] = await Promise.all([
        apiGet<Profile>('/api/profile').catch(() => null),
        fetch('/api/user/kyc').then(r => r.json()).then(d => d.submissions || []).catch(() => []),
      ]);
      if (p) setProfile(p);
      setSubmissions(subs);
    } catch (e) {
      console.error('Failed to load KYC data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!fullName.trim() || !dob.trim() || !address.trim()) {
      setStatus('Please fill all fields');
      return;
    }

    setSubmitting(true);
    setStatus('Submitting...');
    try {
      const docs = documentUrls
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await apiSend('/api/user/kyc', 'POST', {
        personal_data: {
          full_name: fullName,
          dob,
          address,
        },
        documents: docs,
      });

      setStatus('✅ KYC submitted successfully. Your application is under review.');
      setFullName('');
      setDob('');
      setAddress('');
      setDocumentUrls('');
      await load();
    } catch (err: any) {
      setStatus('❌ Error: ' + (err?.message || 'Failed to submit'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-emerald-400';
      case 'rejected':
        return 'text-rose-400';
      case 'pending':
        return 'text-amber-300';
      default:
        return 'text-stone-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-emerald-400/10';
      case 'rejected':
        return 'bg-rose-400/10';
      case 'pending':
        return 'bg-amber-400/10';
      default:
        return 'bg-white/5';
    }
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Compliance</div>
      <h1 className="font-display text-4xl">KYC Verification</h1>
      <p className="mt-2 text-sm text-stone-400">
        Know Your Customer verification is required to unlock full account features and higher trading limits.
      </p>

      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}

      {!loading && profile && (
        <>
          {/* Status Badge */}
          <div className="mt-8">
            <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">Current Status</div>
            <div className={`inline-block rounded-md px-4 py-2 ${getStatusBg(profile.kyc_status || 'unverified')}`}>
              <div className={`text-sm font-semibold uppercase tracking-wide ${getStatusColor(profile.kyc_status || 'unverified')}`}>
                {profile.kyc_status === 'verified'
                  ? '✅ Verified'
                  : profile.kyc_status === 'pending'
                  ? '⏳ Under Review'
                  : profile.kyc_status === 'rejected'
                  ? '❌ Rejected'
                  : '⚪ Unverified'}
              </div>
            </div>
          </div>

          {/* Submission History */}
          {submissions.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] uppercase tracking-widest text-stone-500 mb-3">Submission History</div>
              <div className="space-y-3">
                {submissions.map((sub) => (
                  <div key={sub.id} className={`rounded-md border ${getStatusBg(sub.status)} border-white/10 p-4`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className={`text-sm font-semibold uppercase ${getStatusColor(sub.status)}`}>
                          {sub.status === 'approved'
                            ? '✅ Approved'
                            : sub.status === 'rejected'
                            ? '❌ Rejected'
                            : '⏳ Pending'}
                        </div>
                        <div className="mt-2 text-xs text-stone-400">
                          Submitted: {new Date(sub.submitted_at).toLocaleDateString()}
                        </div>
                        {sub.reviewed_at && (
                          <div className="mt-1 text-xs text-stone-400">
                            Reviewed: {new Date(sub.reviewed_at).toLocaleDateString()}
                          </div>
                        )}
                        {sub.admin_notes && (
                          <div className="mt-2 text-xs text-stone-300">
                            <strong>Notes:</strong> {sub.admin_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit KYC Form */}
          {profile.kyc_status !== 'verified' && (
            <form onSubmit={submit} className="mt-8 rounded-md border border-white/5 p-5">
              <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-4">
                {submissions.length > 0 ? 'Submit New Application' : 'Submit Application'}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-stone-500 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-stone-500 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-stone-500 mb-2">Address</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, City, Country"
                    rows={3}
                    className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-stone-500 mb-2">Document URLs (comma separated)</label>
                  <textarea
                    value={documentUrls}
                    onChange={(e) => setDocumentUrls(e.target.value)}
                    placeholder="https://example.com/id.pdf, https://example.com/proof.pdf"
                    rows={2}
                    className="w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono outline-none"
                  />
                  <small className="block mt-2 text-stone-500">
                    📝 Upload documents to cloud storage (Google Drive, etc.) and paste the shareable link. Our team will review within 24-48 hours.
                  </small>
                </div>

                {status && (
                  <div className={`text-sm ${status.startsWith('❌') ? 'text-rose-300' : status.startsWith('✅') ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {status}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-4 w-full rounded-sm bg-amber-400 px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit KYC Application'}
                </button>
              </div>
            </form>
          )}

          {profile.kyc_status === 'verified' && (
            <div className="mt-8 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-5">
              <div className="text-lg font-semibold text-emerald-300">✅ KYC Verified</div>
              <p className="mt-2 text-sm text-stone-400">
                Your account is fully verified. You now have access to all features and higher trading limits.
              </p>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
