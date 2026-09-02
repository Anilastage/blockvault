import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { userService } from '@/services/userService';
import { TOKEN_KEY } from '@/services/api';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const OVERRIDE_KEY = 'bv_theme';

interface ThemeContextValue {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getSystemTheme = (): ResolvedTheme =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const readOverride = (): ThemeMode => {
  const stored = localStorage.getItem(OVERRIDE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeMode>(readOverride);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const initial = readOverride();
    return initial === 'system' ? getSystemTheme() : initial;
  });

  useEffect(() => {
    let cancelled = false;
    const apply = (mode: ThemeMode) => {
      if (cancelled) return;
      setThemeState(mode);
      setResolved(mode === 'system' ? getSystemTheme() : mode);
    };

    if (localStorage.getItem(OVERRIDE_KEY)) return;
    if (!localStorage.getItem(TOKEN_KEY)) return;
    userService
      .settings()
      .then((settings) => apply(settings.appearance.theme))
      .catch(() => {
        // No override and no saved preference — stick with the OS default.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = useCallback((mode: ThemeMode) => {
    localStorage.setItem(OVERRIDE_KEY, mode);
    setThemeState(mode);
    setResolved(mode === 'system' ? getSystemTheme() : mode);
    userService.updateSettings({ appearance: { theme: mode } }).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};