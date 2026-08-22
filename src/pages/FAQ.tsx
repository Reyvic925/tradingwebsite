import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ChevronDown, Mail, MapPin } from 'lucide-react';

const questions = [
  ['What is The Prime Markets?', 'The Prime Markets is a multi-asset trading platform offering market access, account tools, investment products, and social copy trading.'],
  ['Which markets can I access?', 'Available instruments may include equities, FX, indices, commodities, and digital assets. Availability depends on the account, market conditions, and applicable restrictions.'],
  ['Is copy trading guaranteed to make a profit?', 'No. Copy trading carries risk and past or simulated performance does not guarantee future results. Review each trader, allocation, multiplier, and risk setting carefully.'],
  ['How long do deposits take?', 'Deposit timing depends on the payment method and any compliance review. A deposit is available for trading only after it has been credited to your account.'],
  ['How do withdrawals work?', 'Submit a withdrawal from your account after completing any required identity checks. Requests are reviewed against your available balance and security controls.'],
  ['How does the referral program work?', 'A referrer earns 10% of each confirmed deposit made by an eligible referred client. The reward is credited after the deposit is approved, not at signup.'],
  ['Where does the client service team operate?', 'Our client service network covers London, New York, Singapore, and Dubai, with support for major market sessions and international clients.'],
  ['How can I contact support?', 'Email support@theprimemarkets.com for account, deposit, withdrawal, or platform questions.'],
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <Navbar />
      <main>
        <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(46,125,110,0.16),transparent_38%)] px-5 pb-16 pt-32 lg:px-8">
          <div className="mx-auto max-w-5xl"><div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Support / 02</div><h1 className="mt-4 max-w-3xl font-display text-5xl leading-none sm:text-7xl">Frequently asked questions</h1><p className="mt-6 max-w-2xl text-base leading-relaxed text-stone-400">Clear answers about accounts, markets, deposits, copy trading, and the people behind the desk.</p></div>
        </section>
        <section className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-2">{questions.map(([question, answer]) => <details key={question} className="group rounded-md border border-white/10 bg-white/[0.03] p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-semibold text-white"><span>{question}</span><ChevronDown size={18} className="shrink-0 text-amber-300 transition group-open:rotate-180" /></summary><p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-stone-400">{answer}</p></details>)}</div>
          <div className="mt-14 grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-amber-300/20 bg-amber-300/[0.05] p-6"><Mail size={20} className="text-amber-300" /><h2 className="mt-4 font-display text-3xl text-white">Need a direct answer?</h2><p className="mt-2 text-sm leading-6 text-stone-400">Our support desk can help with account and platform questions.</p><a href="mailto:support@theprimemarkets.com" className="mt-5 inline-block text-sm text-amber-200 hover:text-amber-100">support@theprimemarkets.com</a></div>
            <div className="rounded-md border border-white/10 bg-white/[0.03] p-6"><MapPin size={20} className="text-emerald-300" /><h2 className="mt-4 font-display text-3xl text-white">Major-city coverage</h2><p className="mt-2 text-sm leading-6 text-stone-400">Client service coverage across London, New York, Singapore, and Dubai.</p><div className="mt-5 text-sm text-stone-300">20 St Dunstan's Hill, London EC3R 8HL</div></div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
