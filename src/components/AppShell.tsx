import { BarChart3, Home, ListOrdered, Mic, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Utama', icon: Home, end: true },
  { to: '/transaksi', label: 'Transaksi', icon: ListOrdered },
  { to: '/rekod', label: 'Rekod', icon: Mic, primary: true },
  { to: '/laporan', label: 'Laporan', icon: BarChart3 },
  { to: '/tetapan', label: 'Tetapan', icon: Settings },
] as const;

export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-bg/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <NavLink to="/" aria-label="VAPRO DuitVoice — Utama" className="shrink-0">
          <Logo className="h-9 w-auto" />
        </NavLink>
        <ThemeToggle />
        <span className="brand-stripe absolute inset-x-0 bottom-0 h-0.5" aria-hidden />
      </header>

      <main className="flex-1 px-4 pb-32 pt-5">
        <Outlet />
      </main>

      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5 items-end px-2 pt-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            if ('primary' in item) {
              return (
                <li key={item.to} className="flex justify-center">
                  <NavLink
                    to={item.to}
                    aria-label="Rekod belanja dengan suara"
                    className="mic-brand -mt-8 grid size-16 place-items-center rounded-full transition active:scale-95"
                  >
                    <Icon className="size-7" aria-hidden />
                  </NavLink>
                </li>
              );
            }
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={'end' in item ? item.end : undefined}
                  className={({ isActive }) =>
                    `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition ${
                      isActive ? 'text-accent' : 'text-muted hover:text-ink'
                    }`
                  }
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
