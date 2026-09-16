import { RwaLensShell } from '@/components/rwa/rwa-lens-shell';

export const metadata = {
  title: 'Inspect — RWA Lens',
  description:
    'Inspect a Solana Token-2022 mint: identity, true balance, extensions and transfer readiness. Read-only.',
};

export default function RwaPage() {
  return (
    <main className="flex-1">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-3.5 sm:px-6">
          <span className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 21 18H3Z" fill="none" stroke="#5b5ce2" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M7.5 18h9M9.75 13.5h4.5" stroke="#101a3a" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-[15px] font-semibold tracking-tight">RWA Lens</span>
          </span>
          <span className="rounded bg-indigo-wash px-2 py-1 text-[11px] font-semibold uppercase tracking-[.07em] text-indigo-dark">
            read-only
          </span>
          <nav aria-label="Main" className="ml-auto flex items-center gap-4 text-[13px] text-navy-soft">
            <a className="hover:text-indigo-dark" href="#extensions">Extensions</a>
            <a className="hover:text-indigo-dark" href="https://github.com/operatoruplift/rwa-lens" target="_blank" rel="noreferrer noopener">
              Source
            </a>
          </nav>
        </div>
      </header>
      <RwaLensShell />
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 text-[12px] leading-relaxed text-navy-faint sm:px-6">
          RWA Lens reads public Solana state and explains it. It never signs, sends, mints, burns, freezes or transfers
          anything, and it makes no claim about KYC, AML, securities law, proof of reserves or investment performance.
        </div>
      </footer>
    </main>
  );
}
