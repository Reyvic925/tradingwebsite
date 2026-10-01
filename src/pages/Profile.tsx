import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import { apiSend, bootstrapProfile } from '../lib/api';
import { signOut } from '../lib/auth';
import { useAuth } from '../contexts/AuthContext';
import type { Profile as ProfileT } from '../types';

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

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

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMsg('');
    if (newPassword.length < 8) return setPasswordError('Use at least 8 characters for your new password.');
    if (newPassword !== confirmPassword) return setPasswordError('The new passwords do not match.');
    setPasswordBusy(true);
    try {
      await apiSend('/api/auth/password', 'POST', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg('Password updated. Other signed-in sessions have been closed.');
    } catch (e: unknown) {
      setPasswordError(e instanceof Error ? e.message : 'Password update failed.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const logout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const checklist = [
    { label: 'Profile details', complete: Boolean(profile?.full_name && profile?.country) },
    { label: 'Contact number', complete: Boolean(profile?.phone) },
    { label: 'Identity verification', complete: profile?.kyc_status === 'verified' },
  ];
  const completion = Math.round((checklist.filter((item) => item.complete).length / checklist.length) * 100);

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/70">Account</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="font-display text-4xl">Settings</h1>
          <p className="mt-2 text-sm text-stone-400">Profile, security, preferences, and account help.</p>
        </div>
        {profile && (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/25 bg-amber-300/10 text-sm font-semibold text-amber-200">
              {(profile.full_name || user?.email || 'U').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium">{profile.full_name || 'Your profile'}</div>
              <div className="mt-0.5 text-xs text-stone-500">{user?.email}</div>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="mt-6 h-40 animate-pulse bg-white/5" />}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <section className="border-b border-white/10 py-7">
            <div className="mb-5 flex items-center gap-3">
              <UserRound size={17} className="text-amber-200" />
              <div>
                <h2 className="text-sm font-semibold">Account profile</h2>
                <p className="mt-1 text-xs text-stone-500">Your identity and contact information.</p>
              </div>
            </div>
            <form onSubmit={save}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-stone-400 sm:col-span-2">
                  Email address
                  <span className="mt-1.5 flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-stone-300">
                    <Mail size={14} className="text-stone-500" />
                    <span className="truncate">{user?.email || '—'}</span>
                  </span>
                </label>
                <label className="text-xs text-stone-400 sm:col-span-2">
                  Legal name
                  <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5 w-full border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
                </label>
                <label className="text-xs text-stone-400">
                  Country
                  <span className="relative mt-1.5 block">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                    <input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
                  </span>
                </label>
                <label className="text-xs text-stone-400">
                  Phone
                  <span className="relative mt-1.5 block">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border border-white/10 bg-black/30 py-2.5 pl-9 pr-3 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
                  </span>
                </label>
              </div>
              {error && <div role="alert" className="mt-4 text-sm text-rose-300">{error}</div>}
              {msg && <div role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><Check size={15} />{msg}</div>}
              <button disabled={busy || loading} className="mt-5 inline-flex items-center gap-2 bg-amber-400 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#1a1304] transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">
                <Save size={14} /> {busy ? 'Saving' : 'Save changes'}
              </button>
            </form>
          </section>

          <section className="border-b border-white/10 py-7">
            <div className="mb-5 flex items-center gap-3">
              <ShieldCheck size={17} className="text-amber-200" />
              <div>
                <h2 className="text-sm font-semibold">Identity verification</h2>
                <p className="mt-1 text-xs text-stone-500">View your verification status and application.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-3">
                <FileCheck2 size={18} className={profile?.kyc_status === 'verified' ? 'text-emerald-300' : 'text-stone-400'} />
                <div>
                  <div className="text-sm">Identity documents</div>
                  <div className={`mt-1 text-xs capitalize ${profile?.kyc_status === 'verified' ? 'text-emerald-300' : profile?.kyc_status === 'rejected' ? 'text-rose-300' : 'text-amber-200'}`}>
                    {profile?.kyc_status || 'unverified'}
                  </div>
                </div>
              </div>
              <Link to="/app/kyc" className="inline-flex items-center gap-1 text-xs text-amber-200 hover:text-amber-100">
                {profile?.kyc_status === 'pending' || profile?.kyc_status === 'verified' ? 'View status' : 'Start verification'}
                <ChevronRight size={14} />
              </Link>
            </div>
            {profile?.referral_code && <div className="mt-4 text-xs text-stone-500">Referral code <span className="ml-2 font-mono text-stone-300">{profile.referral_code}</span></div>}
          </section>

          <section className="border-b border-white/10 py-7">
            <div className="mb-5 flex items-center gap-3">
              <KeyRound size={17} className="text-amber-200" />
              <div>
                <h2 className="text-sm font-semibold">Security & access</h2>
                <p className="mt-1 text-xs text-stone-500">Change your password or close this session.</p>
              </div>
            </div>
            <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-3">
              <label className="text-xs text-stone-400">
                Current password
                <input required autoComplete="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5 w-full border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
              </label>
              <label className="text-xs text-stone-400">
                New password
                <input required minLength={8} autoComplete="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5 w-full border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
              </label>
              <label className="text-xs text-stone-400">
                Confirm new password
                <input required minLength={8} autoComplete="new-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5 w-full border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-stone-100 outline-none focus:border-amber-300/60" />
              </label>
              <div className="sm:col-span-3">
                {passwordError && <div role="alert" className="mb-3 text-sm text-rose-300">{passwordError}</div>}
                {passwordMsg && <div role="status" className="mb-3 flex items-center gap-2 text-sm text-emerald-300"><Check size={15} />{passwordMsg}</div>}
                <button disabled={passwordBusy} className="border border-white/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-stone-200 transition hover:border-amber-300/50 hover:text-amber-100 disabled:opacity-50">
                  {passwordBusy ? 'Updating' : 'Update password'}
                </button>
              </div>
            </form>
            <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
              <div>
                <div className="text-sm">Two-factor authentication</div>
                <div className="mt-1 text-xs text-stone-500">Not available for this account yet.</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-stone-600">Unavailable</span>
            </div>
          </section>
        </div>

        <aside className="divide-y divide-white/10 lg:border-l lg:border-white/10 lg:pl-6">
          <section className="py-7 lg:pt-7">
            <div className="mb-4 text-[10px] uppercase tracking-[0.18em] text-stone-500">Trading milestones</div>
            <div className="flex items-end justify-between">
              <div>
                <div className="font-display text-3xl text-amber-200">{completion}%</div>
                <div className="mt-1 text-xs text-stone-500">Account setup</div>
              </div>
              <span className="text-xs text-stone-500">{checklist.filter((item) => item.complete).length} of {checklist.length} complete</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden bg-white/10"><div className="h-full bg-amber-300 transition-all" style={{ width: `${completion}%` }} /></div>
            <div className="mt-4 space-y-2">
              {checklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs text-stone-400">
                  <Check size={13} className={item.complete ? 'text-emerald-300' : 'text-stone-700'} />{item.label}
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-5 text-stone-600">Setup progress never restricts access to your funds or guarantees trading returns.</p>
          </section>

          <section className="py-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">Account</div>
            <Link to="/app/invest" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><FileCheck2 size={16} className="text-stone-400" /> Account upgrade</span><ArrowUpRight size={14} />
            </Link>
            <Link to="/app/wallet" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><Wallet size={16} className="text-stone-400" /> Payouts & wallet</span><ArrowUpRight size={14} />
            </Link>
            <Link to="/app/wallet" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><Wallet size={16} className="text-stone-400" /> Deposit addresses</span><ArrowUpRight size={14} />
            </Link>
          </section>

          <section className="py-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">Preferences</div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-stone-300">Language</span><span className="text-xs text-stone-500">English</span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-stone-300">Appearance</span><span className="text-xs text-stone-500">Dark</span>
            </div>
          </section>

          <section className="py-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">Help & information</div>
            <Link to="/faq" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><CircleHelp size={16} className="text-stone-400" /> FAQ</span><ArrowUpRight size={14} />
            </Link>
            <Link to="/terms" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><BookOpen size={16} className="text-stone-400" /> Terms of service</span><ArrowUpRight size={14} />
            </Link>
            <a href="mailto:support@theprimemarkets.com" className="flex items-center justify-between py-2 text-sm text-stone-300 hover:text-amber-200">
              <span className="flex items-center gap-3"><Mail size={16} className="text-stone-400" /> support@theprimemarkets.com</span><ArrowUpRight size={14} />
            </a>
          </section>

          <section className="py-7">
            <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-stone-500">Account actions</div>
            <button onClick={logout} className="inline-flex items-center gap-2 border border-white/10 px-3 py-2 text-xs text-stone-300 transition hover:border-rose-300/40 hover:text-rose-200">
              <LogOut size={14} /> Sign out
            </button>
            <a href="mailto:support@theprimemarkets.com?subject=Account%20deletion%20request" className="mt-4 block text-xs text-rose-300/80 hover:text-rose-200">Request account deletion</a>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
