import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

/**
 * Theme state for the Warm Stone design system.
 *
 * - Persists the user's explicit choice in localStorage ('theme' = 'light'|'dark').
 * - If the user has never chosen, we leave <html> without a data-theme attribute
 *   so theme.css falls back to the OS `prefers-color-scheme`.
 * - Setting a theme writes `data-theme` on <html>, which flips every CSS token.
 */
const ThemeContext = createContext();

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

const getInitial = () => {
  try {
    return localStorage.getItem('theme'); // 'light' | 'dark' | null
  } catch {
    return null;
  }
};

const systemPrefersDark = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const ThemeProvider = ({ children }) => {
  // null === "follow system"
  const [choice, setChoice] = useState(getInitial);

  // Reflect the current choice onto <html> so CSS tokens switch.
  useEffect(() => {
    const root = document.documentElement;
    if (choice === 'light' || choice === 'dark') {
      root.setAttribute('data-theme', choice);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [choice]);

  // Effective theme (what's actually showing), resolving "follow system".
  const resolved = choice || (systemPrefersDark() ? 'dark' : 'light');

  const apply = useCallback((next) => {
    // Briefly enable transitions for a smooth flip, then remove the class.
    const root = document.documentElement;
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 300);
    setChoice(next);
    try {
      if (next) localStorage.setItem('theme', next);
      else localStorage.removeItem('theme');
    } catch {
      /* ignore storage failures (private mode etc.) */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    apply(resolved === 'dark' ? 'light' : 'dark');
  }, [apply, resolved]);

  const value = useMemo(
    () => ({ theme: resolved, choice, toggleTheme, setTheme: apply }),
    [resolved, choice, toggleTheme, apply]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
