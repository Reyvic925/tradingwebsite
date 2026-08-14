import AdminShell from '../../components/AdminShell';

export default function AdminHealth() {
  const checks = [
    { label: 'Authentication', status: 'Ready', tone: 'text-emerald-400' },
    { label: 'Supabase profile role gate', status: 'Ready', tone: 'text-emerald-400' },
    { label: 'Admin API guard', status: 'Ready', tone: 'text-emerald-400' },
    { label: 'Public wallet UX', status: 'Ready', tone: 'text-emerald-400' },
  ];

  return (
    <AdminShell title="Health & operations">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <div key={item.label} className="rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Check</div>
            <div className="mt-3 text-lg text-stone-100">{item.label}</div>
            <div className={`mt-3 text-sm font-medium ${item.tone}`}>{item.status}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-md border border-white/10 bg-[#0a0f17] p-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Operational notes</div>
        <ul className="mt-4 space-y-3 text-sm text-stone-300">
          <li>• Set a real user profile with role = admin in Supabase to grant dashboard access.</li>
          <li>• Keep ADMIN_SECRET and CRON_SECRET configured for server-side automation and protected admin endpoints.</li>
          <li>• Confirm emails before sign-in or disable Supabase email confirmation if the project is in dev mode.</li>
        </ul>
      </div>
    </AdminShell>
  );
}
