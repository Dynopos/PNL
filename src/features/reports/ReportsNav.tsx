import { NavLink } from 'react-router-dom';

const LINKS = [
  { to: '/laporan', label: 'Ringkasan', end: true },
  { to: '/laporan/pnl', label: 'Untung Rugi', end: false },
];

/** Switches between the report pages under Laporan. */
export function ReportsNav() {
  return (
    <nav aria-label="Jenis laporan" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) =>
            `flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition ${
              isActive ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted'
            }`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  );
}
