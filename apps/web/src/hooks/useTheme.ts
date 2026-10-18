import { useEffect, useState } from 'react';
function initialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('hublink-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Storage may be disabled. */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function useTheme() {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('hublink-theme', theme);
    } catch {
      /* Storage may be disabled. */
    }
  }, [theme]);
  return { theme, setTheme };
}
