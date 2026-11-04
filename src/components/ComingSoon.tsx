import type { LucideIcon } from 'lucide-react';

export function ComingSoon({
  icon: Icon,
  title,
  phase,
  items,
}: {
  icon: LucideIcon;
  title: string;
  phase: number;
  items: string[];
}) {
  return (
    <section>
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      <div className="mt-5 rounded-2xl border border-dashed border-line bg-surface p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-display font-semibold">Dalam pembinaan</p>
            <p className="text-sm text-muted">Dijadualkan dalam Fasa {phase}</p>
          </div>
        </div>
        <ul className="mt-5 space-y-2 text-sm text-muted">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-accent" aria-hidden>
                •
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
