import { act, render, screen } from '@testing-library/react';
import { ThemeProvider, resolveTheme, useTheme } from './theme';

function Probe() {
  const { resolved, toggle } = useTheme();
  return <button onClick={toggle}>{resolved}</button>;
}

describe('resolveTheme', () => {
  it('follows the system only when preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('toggles the dark class on <html> and remembers the choice', () => {
    localStorage.setItem('vapro-theme', 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement).not.toHaveClass('dark');

    act(() => screen.getByRole('button').click());

    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('vapro-theme')).toBe('dark');
  });
});
