import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authService } from '@/services/authService';
import type { LoginResponse, RegisterResponse } from '@/services/authService';
import { TOKEN_KEY } from '@/services/api';
import type { User, UserRole } from '@/types';

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResponse>;
  completeMfa: (mfaToken: string, code: string) => Promise<User>;
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<RegisterResponse>;
  completeEmailVerification: (mfaToken: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    authService
      .me()
      .then(setUser)
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    const handler = (): void => clearAuth();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [clearAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login(email, password);
    // Email verification (mandatory for legacy/unverified accounts) and the MFA
    // challenge both return without a session token — let the page handle them.
    if (result.requiresEmailVerification) return result;
    if (result.requiresTwoFactor) return result;
    localStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    return result;
  }, []);

  const completeMfa = useCallback(async (mfaToken: string, code: string) => {
    const { token, user: loggedInUser } = await authService.verifyMfa(mfaToken, code);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const register = useCallback(async (payload: Parameters<typeof authService.register>[0]) => {
    // Registration now returns a mandatory email-verification challenge; no
    // session token is stored until completeEmailVerification succeeds.
    return authService.register(payload);
  }, []);

  const completeEmailVerification = useCallback(async (mfaToken: string, code: string) => {
    const { token, user: verifiedUser } = await authService.verifyEmail(mfaToken, code);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(verifiedUser);
    return verifiedUser;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const fresh = await authService.me();
    setUser(fresh);
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? null,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'ADMIN',
      loading,
      login,
      completeMfa,
      register,
      completeEmailVerification,
      logout,
      refreshUser,
    }),
    [user, loading, login, completeMfa, register, completeEmailVerification, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
