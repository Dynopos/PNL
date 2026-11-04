import type { AccountKind } from '../../lib/types';
import { useAccount } from './AccountProvider';

const OPTIONS: { value: AccountKind; label: string }[] = [
  { value: 'personal', label: 'Peribadi' },
  { value: 'business', label: 'Bisnes' },
];

export function AccountSwitch() {
  const { kind, setKind } = useAccount();
  return (
    <div role="radiogroup" aria-label="Akaun" className="flex rounded-xl border border-line bg-surface p-1 text-xs font-semibold">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={kind === o.value}
          onClick={() => setKind(o.value)}
          className={`min-h-9 rounded-lg px-3 transition ${
            kind === o.value ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
