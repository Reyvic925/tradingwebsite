import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { authHeaders } from '../lib/api';

async function readJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
}

export default function AdminCryptoKeys() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ id: any; privateKey: string | null; mnemonic: string | null } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [error, setError] = useState('');

  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const res = await fetch('/api/admin/crypto-addresses', { headers });
      const j = await readJsonOrText(res);
      if (!res.ok) throw new Error(j?.error || 'Failed to load addresses');
      setRows(j?.data || []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchList(); }, []);

  async function reveal(id: any) {
    setRevealing(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const res = await fetch(`/api/admin/crypto-addresses/${id}/decrypt`, { headers });
      const j = await readJsonOrText(res);
      if (!res.ok) throw new Error(j?.error || 'Reveal failed');
      setModal({
        id,
        privateKey: j?.privateKey || null,
        mnemonic: j?.mnemonic || null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reveal failed');
    } finally {
      setRevealing(false);
    }
  }

  function copyToClipboard(v: string | null) {
    if (!v) return;
    navigator.clipboard?.writeText(v).then(() => alert('Copied to clipboard'));
  }

  return (
    <AdminShell title="Crypto addresses">
      <div className="mb-5 rounded-md border border-white/10 bg-[#0a0f17] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Admin secret override</div>
            <input
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="Optional x-admin-secret"
              className="mt-2 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-amber-400/60"
            />
          </div>
          <button onClick={() => fetchList()} disabled={loading} className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1304] disabled:opacity-60">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-md border border-white/10 bg-[#0a0f17]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Network</th>
                <th className="px-4 py-3 font-medium">Currency</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/10">
                  <td className="px-4 py-3 text-stone-300">{r.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-300">{r.user_id}</td>
                  <td className="px-4 py-3 text-stone-200">{r.network || '—'}</td>
                  <td className="px-4 py-3 text-stone-200">{r.currency}</td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-200/80">{r.address}</td>
                  <td className="px-4 py-3 text-stone-400">{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => reveal(r.id)} disabled={revealing} className="rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-200 disabled:opacity-60">
                      {revealing ? 'Revealing…' : 'Reveal keys'}
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-stone-500">No crypto addresses found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <h3 className="font-display text-2xl">Decrypted keys for address #{modal.id}</h3>
            <p className="mt-3 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              Warning: Private keys and mnemonics are highly sensitive. Only copy/store them in a secure environment. This action is audited.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">Private key</div>
                <pre className="whitespace-pre-wrap rounded-sm border border-white/10 bg-black/30 p-3 font-mono text-xs text-stone-200">{modal.privateKey || '<none>'}</pre>
                <button onClick={() => copyToClipboard(modal.privateKey)} className="mt-2 inline-flex items-center gap-2 rounded-sm border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-stone-200">
                  <Copy size={12} /> Copy private key
                </button>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">Mnemonic</div>
                <pre className="whitespace-pre-wrap rounded-sm border border-white/10 bg-black/30 p-3 font-mono text-xs text-stone-200">{modal.mnemonic || '<none>'}</pre>
                <button onClick={() => copyToClipboard(modal.mnemonic)} className="mt-2 inline-flex items-center gap-2 rounded-sm border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-stone-200">
                  <Copy size={12} /> Copy mnemonic
                </button>
              </div>
            </div>

            <div className="mt-6 text-right">
              <button onClick={() => setModal(null)} className="rounded-sm border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-stone-200">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
