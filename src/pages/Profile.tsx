import { useEffect, useState } from 'react';
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
      setMsg('Profile updated');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const submitKyc = async () => {
    if (!fullName || !country || !phone) return setError('Complete all fields before submitting KYC');
    setBusy(true);
    try {
      const updated = await apiSend<ProfileT>('/api/profile', 'PUT', {
        full_name: fullName,
        country,
        phone,
        kyc_status: 'pending',
      });
      setProfile(updated);
      setTimeout(async () => {
        const verified = await apiSend<ProfileT>('/api/profile', 'PUT', { kyc_status: 'verified' });
        setProfile(verified);
        setMsg('Identity verified. Higher limits unlocked.');
      }, 1400);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'KYC failed');
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
          <div className="mt-2 font-display text-3xl capitalize text-amber-200">{profile?.kyc_status || 'unverified'}</div>
          <p className="mt-3 text-sm text-stone-400">Submit identity details to raise deposit and withdrawal limits. Review typically completes instantly on this desk.</p>
          <div className="mt-4 text-xs text-stone-500">Referral code {profile?.referral_code}</div>
          <button onClick={submitKyc} disabled={busy || profile?.kyc_status === 'verified'} className="mt-5 w-full rounded-sm border border-amber-300/40 py-2 text-xs uppercase tracking-widest text-amber-200 disabled:opacity-40">
            {profile?.kyc_status === 'verified' ? 'Verified' : 'Submit KYC'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
