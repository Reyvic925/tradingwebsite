import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { MapPin, ShieldCheck } from 'lucide-react';

const officeLocations = [
  { city: 'London', detail: "20 St Dunstan's Hill, London EC3R 8HL, United Kingdom", image: '/images/avatar-1.jpg' },
  { city: 'New York', detail: 'Client coverage across the Americas', image: '/images/avatar-2.jpg' },
  { city: 'Singapore', detail: 'Asia-Pacific client coverage', image: '/images/avatar-3.jpg' },
  { city: 'Dubai', detail: 'Middle East client coverage', image: '/images/avatar-4.jpg' },
];

const gallery = ['/images/avatar-5.jpg', '/images/avatar-6.jpg', '/images/avatar-7.jpg', '/images/avatar-8.jpg'];

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#05070b] text-stone-100">
      <Navbar />
      <main>
        <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(198,157,64,0.16),transparent_38%)] px-5 pb-16 pt-32 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Legal / 01</div>
            <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none sm:text-7xl">Terms of Service</h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-stone-400">These terms govern access to The Prime Markets platform, its trading tools, investment products, and client support services.</p>
            <div className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-stone-500"><ShieldCheck size={16} className="text-amber-300" /> Effective 22 August 2026</div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.35fr_0.65fr]">
            <article className="space-y-8 text-sm leading-7 text-stone-300">
              <section><h2 className="font-display text-3xl text-white">1. Using the platform</h2><p className="mt-3">By opening or using an account, you confirm that you are legally able to enter into these terms, that the information you provide is accurate, and that you will keep your account credentials secure. One person may not operate multiple accounts to circumvent platform controls.</p></section>
              <section><h2 className="font-display text-3xl text-white">2. Trading and market risk</h2><p className="mt-3">Trading leveraged products and digital assets can result in rapid losses, including loss of deposited capital. Prices, spreads, execution, copy-trading results, and simulated performance can change without notice. Past performance is not a guarantee of future results.</p></section>
              <section><h2 className="font-display text-3xl text-white">3. Deposits and withdrawals</h2><p className="mt-3">Deposits may require review before funds are credited. Withdrawal requests are subject to account verification, available balance, applicable fees, and compliance checks. We may delay or reject a transaction where required by law or to protect the platform and its clients.</p></section>
              <section><h2 className="font-display text-3xl text-white">4. Copy trading</h2><p className="mt-3">Copy trading is an instruction to mirror selected lead-trader activity according to the settings you choose. It is not personal financial advice or a promise of profit. You remain responsible for reviewing risk settings and stopping copying when appropriate.</p></section>
              <section><h2 className="font-display text-3xl text-white">5. Acceptable conduct</h2><p className="mt-3">You must not misuse the service, attempt unauthorized access, manipulate prices or records, submit fraudulent documents, or use the platform for unlawful activity. We may suspend access while investigating suspected misuse.</p></section>
              <section><h2 className="font-display text-3xl text-white">6. Privacy and communications</h2><p className="mt-3">Account, identity, transaction, and technical information is handled as described in our privacy notices and applicable law. You agree that we may send service messages about security, transactions, verification, and material changes to these terms.</p></section>
              <section><h2 className="font-display text-3xl text-white">7. Changes and contact</h2><p className="mt-3">We may update these terms when the service, law, or risk controls change. Continued use after an update means you accept the revised terms. Questions can be sent to <a className="text-amber-200 hover:text-amber-100" href="mailto:support@theprimemarkets.com">support@theprimemarkets.com</a>.</p></section>
            </article>

            <aside className="h-fit rounded-md border border-white/10 bg-white/[0.03] p-5 lg:sticky lg:top-24">
              <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">Client network</div>
              <h2 className="mt-2 font-display text-3xl text-white">Across major markets</h2>
              <p className="mt-3 text-sm leading-6 text-stone-400">Our client service network supports traders and private clients across London, New York, Singapore, and Dubai.</p>
              <div className="mt-6 space-y-4">
                {officeLocations.map((office) => <div key={office.city} className="flex gap-3"><img src={office.image} alt="" className="h-10 w-10 rounded-sm object-cover" /><div><div className="flex items-center gap-1 text-sm font-semibold text-white"><MapPin size={13} className="text-amber-300" />{office.city}</div><div className="mt-1 text-xs leading-5 text-stone-500">{office.detail}</div></div></div>)}
              </div>
            </aside>
          </div>

          <div className="mt-16 border-t border-white/10 pt-10"><div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">The desk</div><h2 className="mt-2 font-display text-4xl text-white">A global view of the work</h2><div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{gallery.map((image, index) => <img key={image} src={image} alt={`The Prime Markets client service view ${index + 1}`} className="aspect-[4/3] w-full rounded-sm object-cover opacity-80 transition hover:opacity-100" />)}</div></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
