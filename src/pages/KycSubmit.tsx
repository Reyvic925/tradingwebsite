import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Car, Check, ChevronLeft, ChevronRight, Contact, FileCheck2, Globe, MapPin, ShieldCheck, Upload, UserRound } from 'lucide-react';
import AppShell from '../components/AppShell';
import { apiGet, apiSend } from '../lib/api';
import { COUNTRIES } from '../lib/countries';
import { compressImageToDataUrl } from '../lib/image';

interface KycFileRef {
  kind: 'document_front' | 'document_back';
  file_id: number;
  name?: string | null;
}

interface KycSubmission {
  id: number;
  user_id: string;
  personal_data: Record<string, any>;
  documents: KycFileRef[] | string[];
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at?: string;
  admin_notes?: string;
}

interface ProfileT {
  kyc_status: string;
  full_name?: string;
  email?: string;
}

const DOC_TYPES = [
  { value: 'passport', label: 'Passport', hint: 'Photo page', icon: Globe },
  { value: 'national_id', label: 'National ID', hint: 'Front & back', icon: Contact },
  { value: 'drivers_license', label: 'Driver’s License', hint: 'Front & back', icon: Car },
] as const;

const STEPS = [
  { label: 'Personal info', icon: UserRound },
  { label: 'Residential address', icon: MapPin },
  { label: 'Identity document', icon: FileCheck2 },
];

type Upload = { fileId: number; preview: string; name: string } | null;
type Slot = { upload: Upload; busy: boolean; error: string };

const emptySlot: Slot = { upload: null, busy: false, error: '' };

function ageFrom(dob: string): number {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

const inputCls = 'w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-amber-400/60';
const labelCls = 'block text-[10px] uppercase tracking-widest text-stone-500 mb-2';

function CountrySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">Select country</option>
      {COUNTRIES.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

export default function KycSubmit() {
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  // Step 1 — personal info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [nationality, setNationality] = useState('');
  const [country, setCountry] = useState('');
  const [gender, setGender] = useState('');

  // Step 2 — residential address
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postal, setPostal] = useState('');
  const [addressCountry, setAddressCountry] = useState('');

  // Step 3 — identity document
  const [docType, setDocType] = useState<'' | (typeof DOC_TYPES)[number]['value']>('');
  const [docNumber, setDocNumber] = useState('');
  const [docExpiry, setDocExpiry] = useState('');
  const [front, setFront] = useState<Slot>(emptySlot);
  const [back, setBack] = useState<Slot>(emptySlot);

  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [p, subs] = await Promise.all([
        apiGet<{ profile: ProfileT }>('/api/profile').then((d) => d.profile).catch(() => null),
        apiGet<{ submissions: KycSubmission[] }>('/api/user/kyc').then((d) => d.submissions || []).catch(() => []),
      ]);
      if (p) setProfile(p);
      setSubmissions(subs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const status = profile?.kyc_status || 'unverified';
  const needsBack = docType !== '' && docType !== 'passport';

  const validateStep = (s: number): string => {
    if (s === 0) {
      if (!firstName.trim() || !lastName.trim()) return 'Enter your legal first and last name exactly as on your document';
      const age = ageFrom(dob);
      if (!dob || age < 0) return 'Enter your date of birth';
      if (age < 18) return 'You must be at least 18 years old';
      if (!nationality) return 'Select your nationality';
      if (!country) return 'Select your country of residence';
    }
    if (s === 1) {
      if (!street.trim()) return 'Enter your street address';
      if (!city.trim()) return 'Enter your city';
      if (!addressCountry && !country) return 'Select the country of your residential address';
    }
    if (s === 2) {
      if (!docType) return 'Select a document type';
      if (!docNumber.trim()) return 'Enter the document number';
      if (!docExpiry || Number.isNaN(new Date(docExpiry).getTime())) return 'Enter the document expiry date';
      if (new Date(docExpiry).getTime() <= Date.now()) return 'The document has expired — provide one with a future expiry date';
      if (!front.upload) return 'Upload the front side of your document';
      if (needsBack && !back.upload) return 'Upload the back side of your document';
    }
    return '';
  };

  const next = () => {
    const msg = validateStep(step);
    if (msg) return setError(msg);
    setError('');
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const prev = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const pickFile = async (kind: 'document_front' | 'document_back', file: File | undefined, setSlot: (s: Slot) => void) => {
    if (!file) return;
    setSlot({ upload: null, busy: true, error: '' });
    setError('');
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const res = await apiSend<{ file: { id: number } }>('/api/kyc-upload', 'POST', {
        kind,
        data_url: dataUrl,
        filename: file.name,
      });
      if (!res?.file?.id) throw new Error('Upload failed');
      setSlot({ upload: { fileId: res.file.id, preview: dataUrl, name: file.name }, busy: false, error: '' });
    } catch (e: any) {
      setSlot({ upload: null, busy: false, error: e?.message || 'Upload failed' });
    }
  };

  const submit = async () => {
    for (let s = 0; s < STEPS.length; s++) {
      const msg = validateStep(s);
      if (msg) {
        setStep(s);
        return setError(msg);
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const documents: KycFileRef[] = [];
      if (front.upload) documents.push({ kind: 'document_front', file_id: front.upload.fileId, name: front.upload.name });
      if (back.upload) documents.push({ kind: 'document_back', file_id: back.upload.fileId, name: back.upload.name });

      await apiSend('/api/user/kyc', 'POST', {
        personal_data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          nationality,
          country,
          gender: gender || null,
          address: {
            street: street.trim(),
            city: city.trim(),
            state: region.trim(),
            postal_code: postal.trim(),
            country: addressCountry || country,
          },
          document: { type: docType, number: docNumber.trim(), expiry_date: docExpiry },
        },
        documents,
      });

      setNotice('Application submitted. Verification usually completes within 24–48 hours.');
      setStep(0);
      setFirstName(''); setLastName(''); setDob(''); setNationality(''); setCountry(''); setGender('');
      setStreet(''); setCity(''); setRegion(''); setPostal(''); setAddressCountry('');
      setDocType(''); setDocNumber(''); setDocExpiry('');
      setFront(emptySlot); setBack(emptySlot);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const statusPill = (s: string) => {
    if (s === 'verified') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
    if (s === 'pending') return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
    if (s === 'rejected') return 'border-rose-400/30 bg-rose-400/10 text-rose-300';
    return 'border-white/10 bg-white/5 text-stone-400';
  };

  const latest = submissions[0] || null;
  const showWizard = status === 'unverified' || status === 'rejected';

  const uploadBox = (
    slot: Slot,
    setSlot: (s: Slot) => void,
    inputRef: React.RefObject<HTMLInputElement | null>,
    kind: 'document_front' | 'document_back',
    title: string,
  ) => (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-stone-500">{title}</span>
        {slot.upload && (
          <button type="button" className="text-[10px] uppercase tracking-widest text-rose-300 hover:text-rose-200" onClick={() => { setSlot(emptySlot); if (inputRef.current) inputRef.current.value = ''; }}>
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={slot.busy}
        className={`flex w-full items-center justify-center overflow-hidden rounded-sm border border-dashed transition ${
          slot.upload ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/15 bg-black/30 hover:border-amber-400/50'
        } px-3 py-4 disabled:opacity-60`}
      >
        {slot.busy ? (
          <span className="text-xs text-amber-300">Uploading…</span>
        ) : slot.upload ? (
          <img src={slot.upload.preview} alt={title} className="max-h-40 w-auto rounded-sm" />
        ) : (
          <span className="flex items-center gap-2 text-xs text-stone-400">
            <Upload size={14} />
            {title} — click to upload (JPG/PNG)
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pickFile(kind, e.target.files?.[0], setSlot)}
      />
      {slot.error && <div className="mt-1 text-xs text-rose-300">{slot.error}</div>}
    </div>
  );

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Compliance</div>
      <h1 className="font-display text-4xl">Identity Verification</h1>
      <p className="mt-2 text-sm text-stone-400">
        Verify your identity to secure your account and unlock withdrawals. Your information is encrypted and only reviewed by our compliance team.
      </p>

      {loading && <div className="mt-8 h-40 animate-pulse rounded-md bg-white/5" />}

      {!loading && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className={`inline-block rounded-sm border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${statusPill(status)}`}>
              {status === 'verified' ? '✅ Verified' : status === 'pending' ? '⏳ Under review' : status === 'rejected' ? '❌ Rejected' : '⚪ Not verified'}
            </span>
            {status === 'verified' && <span className="text-xs text-stone-400">Full account access enabled.</span>}
          </div>

          {notice && status === 'pending' && (
            <div className="mt-4 rounded-sm border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">{notice}</div>
          )}

          {status === 'pending' && (
            <div className="mt-6 rounded-md border border-amber-400/25 bg-amber-400/5 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                <ShieldCheck size={16} /> Application under review
              </div>
              <p className="mt-2 text-sm text-stone-400">
                Our compliance team is reviewing your documents. You will receive a notification as soon as a decision is made — typically within 24–48 hours.
              </p>
            </div>
          )}

          {status === 'verified' && (
            <div className="mt-6 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-5">
              <div className="text-lg font-semibold text-emerald-300">Identity verified</div>
              <p className="mt-2 text-sm text-stone-400">Your account is fully verified. Withdrawals are enabled and all account features are unlocked.</p>
            </div>
          )}

          {status === 'rejected' && latest && (
            <div className="mt-6 rounded-md border border-rose-400/30 bg-rose-400/5 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-200">
                <AlertTriangle size={16} /> Your last application was rejected
              </div>
              {latest.admin_notes && <p className="mt-2 text-sm text-stone-300">Reason: {latest.admin_notes}</p>}
              <p className="mt-2 text-sm text-stone-400">Review the requirements below and submit a new application.</p>
            </div>
          )}

          {showWizard && (
            <div className="mt-8 rounded-md border border-white/10 bg-[#0a0f17] p-5">
              {/* Stepper */}
              <div className="mb-6 flex items-center gap-2">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const active = i === step;
                  const done = i < step;
                  return (
                    <div key={s.label} className="flex flex-1 items-center gap-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs ${
                          done ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
                            : active ? 'border-amber-400/60 bg-amber-400/10 text-amber-300'
                            : 'border-white/10 text-stone-500'
                        }`}
                      >
                        {done ? <Check size={14} /> : <Icon size={14} />}
                      </div>
                      <span className={`hidden text-[11px] uppercase tracking-widest sm:block ${active ? 'text-amber-200' : 'text-stone-500'}`}>{s.label}</span>
                      {i < STEPS.length - 1 && <div className={`h-px flex-1 ${done ? 'bg-emerald-400/30' : 'bg-white/10'}`} />}
                    </div>
                  );
                })}
              </div>

              {/* Step 1 — personal info */}
              {step === 0 && (
                <div className="space-y-4">
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Enter your details exactly as they appear on your document</div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="kyc-first">First name</label>
                      <input id="kyc-first" className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-last">Last name</label>
                      <input id="kyc-last" className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-dob">Date of birth</label>
                      <input id="kyc-dob" type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-gender">Gender (optional)</label>
                      <select id="kyc-gender" className={inputCls} value={gender} onChange={(e) => setGender(e.target.value)}>
                        <option value="">Prefer not to say</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-nat">Nationality</label>
                      <CountrySelect id="kyc-nat" value={nationality} onChange={setNationality} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-country">Country of residence</label>
                      <CountrySelect id="kyc-country" value={country} onChange={setCountry} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2 — residential address */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Enter your current residential address</div>
                  <div>
                    <label className={labelCls} htmlFor="kyc-street">Street address</label>
                    <input id="kyc-street" className={inputCls} value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St, Apt 4" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="kyc-city">City</label>
                      <input id="kyc-city" className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-region">State / Province</label>
                      <input id="kyc-region" className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Lagos" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-postal">Postal / ZIP code</label>
                      <input id="kyc-postal" className={inputCls} value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="100001" />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="kyc-addr-country">Country</label>
                      <CountrySelect id="kyc-addr-country" value={addressCountry || country} onChange={setAddressCountry} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3 — identity document */}
              {step === 2 && (
                <div className="space-y-5">
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">Choose an identity document and upload a clear photo of it</div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {DOC_TYPES.map((d) => {
                      const Icon = d.icon;
                      const selected = docType === d.value;
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => setDocType(d.value)}
                          className={`flex items-center gap-3 rounded-sm border px-4 py-3 text-left transition ${
                            selected ? 'border-amber-400/60 bg-amber-400/10' : 'border-white/10 bg-black/30 hover:border-white/25'
                          }`}
                        >
                          <Icon size={18} className={selected ? 'text-amber-300' : 'text-stone-400'} />
                          <div>
                            <div className={`text-sm ${selected ? 'text-amber-100' : 'text-stone-200'}`}>{d.label}</div>
                            <div className="text-[10px] uppercase tracking-widest text-stone-500">{d.hint}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {docType && (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={labelCls} htmlFor="kyc-docnum">Document number</label>
                          <input id="kyc-docnum" className={inputCls} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="A01234567" />
                        </div>
                        <div>
                          <label className={labelCls} htmlFor="kyc-docexp">Expiry date</label>
                          <input id="kyc-docexp" type="date" className={inputCls} value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
                        </div>
                      </div>

                      <div className={`grid gap-4 ${needsBack ? 'sm:grid-cols-2' : ''}`}>
                        {uploadBox(front, setFront, frontInput, 'document_front', docType === 'passport' ? 'Passport photo page' : 'Front side')}
                        {needsBack && uploadBox(back, setBack, backInput, 'document_back', 'Back side')}
                      </div>

                      <div className="rounded-sm border border-white/5 bg-black/20 px-3 py-2 text-[11px] text-stone-500">
                        Make sure details are readable, all corners are visible, and there is no glare. Files are reviewed by compliance only.
                      </div>
                    </>
                  )}
                </div>
              )}

              {error && <div className="mt-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

              {/* Navigation */}
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={prev}
                  disabled={step === 0}
                  className="flex items-center gap-1 rounded-sm border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.16em] text-stone-300 disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Back
                </button>
                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={next}
                    className="flex items-center gap-1 rounded-sm bg-amber-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1304]"
                  >
                    Continue <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || front.busy || back.busy}
                    className="flex items-center gap-1 rounded-sm bg-amber-400 px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1304] disabled:opacity-60"
                  >
                    <ShieldCheck size={14} /> {submitting ? 'Submitting…' : 'Submit for verification'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Submission history */}
          {submissions.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] uppercase tracking-widest text-stone-500 mb-3">Submission history</div>
              <div className="space-y-3">
                {submissions.map((sub) => (
                  <div key={sub.id} className="rounded-md border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className={`text-sm font-semibold uppercase tracking-wide ${
                        sub.status === 'approved' ? 'text-emerald-400' : sub.status === 'rejected' ? 'text-rose-400' : 'text-amber-300'
                      }`}>
                        {sub.status === 'approved' ? '✅ Approved' : sub.status === 'rejected' ? '❌ Rejected' : '⏳ Pending review'}
                      </div>
                      <div className="text-xs text-stone-500">Submitted {new Date(sub.submitted_at).toLocaleString()}</div>
                    </div>
                    {sub.reviewed_at && (
                      <div className="mt-1 text-xs text-stone-500">Reviewed {new Date(sub.reviewed_at).toLocaleString()}</div>
                    )}
                    {sub.admin_notes && (
                      <div className="mt-2 text-xs text-stone-300"><strong>Reviewer note:</strong> {sub.admin_notes}</div>
                    )}
                    {Array.isArray(sub.documents) && sub.documents.length > 0 && (
                      <div className="mt-2 text-xs text-stone-500">
                        Documents: {sub.documents.map((d) => (typeof d === 'string' ? 'link' : d.kind === 'document_front' ? 'front' : 'back')).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
