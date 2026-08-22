import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#07090e] pt-16 pb-8">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 md:grid-cols-2 lg:grid-cols-5 lg:px-8">
        <div>
          <div className="font-display text-2xl text-stone-50">{BRAND.name}</div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-300/70">{BRAND.product}</div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-400">
            Institutional-grade execution for private clients. Multi-asset desks across New York, London, and Singapore.
          </p>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Platform</div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-stone-400">
            <a href="#features">Features</a>
            <a href="#plans">Investment plans</a>
            <Link to="/app/trade">Trading desk</Link>
            <Link to="/app/social">Social trading</Link>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Company</div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-stone-400">
            <a href="#trust">Regulation</a>
            <a href="#proof">Client stories</a>
            <span>{BRAND.legal}</span>
            <span>Reg. No. {BRAND.reg}</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Contact</div>
          <div className="mt-4 flex flex-col gap-3 text-sm text-stone-400">
            <a href="mailto:support@theprimemarkets.com" className="break-words hover:text-amber-200">
              support@theprimemarkets.com
            </a>
            <address className="not-italic leading-relaxed">
              20 St Dunstan's Hill<br />
              London EC3R 8HL<br />
              United Kingdom
            </address>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-300/80">Legal</div>
          <p className="mt-4 text-xs leading-relaxed text-stone-500">
            Trading leveraged products involves substantial risk of loss. Past performance is not indicative of future results. Capital is at risk.
          </p>
        </div>
      </div>
      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-3 border-t border-white/5 px-5 pt-6 text-[11px] uppercase tracking-[0.16em] text-stone-600 md:flex-row lg:px-8">
        <span>© {new Date().getFullYear()} {BRAND.legal}. All rights reserved.</span>
        <span>SSL · GDPR · PCI-DSS · 30-day guarantee</span>
      </div>
    </footer>
  );
}
