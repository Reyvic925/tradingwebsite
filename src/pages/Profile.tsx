import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import AppShell from '../components/AppShell';
import { apiSend, bootstrapProfile } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Profile as ProfileT } from '../types';

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await bootstrapProfile() as { profile?: ProfileT };
      if (!data?.profile) throw new Error('Profile unavailable');
      setProfile(data.profile);
      setFullName(data.profile.full_name || '');
      setCountry(data.profile.country || '');
      setPhone(data.profile.phone || '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return setError('Name is required');
    setBusy(true);
    setError('');
    try {
      const updated = await apiSend<ProfileT>('/api/profile', 'PUT', { full_name: fullName, country, phone });
      setProfile(updated);
      setFullName(updated.full_name || '');
      setCountry(updated.country || '');
      setPhone(updated.phone || '');
      setMsg('Profile updated');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Account</div>
      <h1 className="font-display text-4xl">Profile & KYC</h1>
      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={save} className="rounded-md border border-white/5 p-6">
          <div className="text-sm text-stone-400">{user?.email}</div>
          <label className="mt-5 block text-[10px] uppercase tracking-widest text-stone-500">Legal name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none" />
          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Country</label>
          <input value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none" />
          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none" />
          {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
          {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}
          <button disabled={busy} className="mt-5 rounded-sm bg-amber-400 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304]">
            Save profile
          </button>
        </form>

        <div className="rounded-md border border-white/5 p-6">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Verification</div>
          <div className={`mt-2 font-display text-3xl capitalize ${profile?.kyc_status === 'verified' ? 'text-emerald-300' : profile?.kyc_status === 'rejected' ? 'text-rose-300' : 'text-amber-200'}`}>
            {profile?.kyc_status || 'unverified'}
          </div>
          <p className="mt-3 text-sm text-stone-400">
            {profile?.kyc_status === 'verified'
              ? 'Your identity is verified. Withdrawals are enabled on your account.'
              : 'Verify your identity with a government-issued document to unlock withdrawals. Review usually completes within 24–48 hours.'}
          </p>
          <div className="mt-4 text-xs text-stone-500">Referral code {profile?.referral_code}</div>
          {profile?.kyc_status === 'verified' ? (
            <div className="mt-5 flex items-center justify-center gap-2 rounded-sm border border-emerald-300/30 py-2 text-xs uppercase tracking-widest text-emerald-200">
              <ShieldCheck size={14} /> Verified
            </div>
          ) : (
            <Link to="/app/kyc" className="mt-5 block w-full rounded-sm border border-amber-300/40 py-2 text-center text-xs uppercase tracking-widest text-amber-200 hover:bg-amber-400/10">
              {profile?.kyc_status === 'pending' ? 'View application status' : 'Start identity verification'}
            </Link>
          )}
        </div>
      </div>
    </AppShell>
  );
}
