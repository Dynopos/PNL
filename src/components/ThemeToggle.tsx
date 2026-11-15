import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const toDark = resolved === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={toDark ? 'Tukar ke mod gelap' : 'Tukar ke mod cerah'}
      className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink transition hover:border-accent hover:text-accent"
    >
      {toDark ? <Moon className="size-5" aria-hidden /> : <Sun className="size-5" aria-hidden />}
    </button>
  );
}
