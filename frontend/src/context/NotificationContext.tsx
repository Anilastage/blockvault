import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { API_BASE_URL, TOKEN_KEY } from '@/services/api';

const NotificationContext = createContext<null>(null);

/**
 * Keeps notification queries fresh: subscribes to the server-side SSE stream
 * and refetches in real time, with a 30s polling fallback.
 */
export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;
    let source: EventSource | null = null;

    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    };

    const poll = window.setInterval(invalidate, 30_000);

    try {
      const token = localStorage.getItem(TOKEN_KEY) ?? '';
      source = new EventSource(
        `${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`
      );
      source.addEventListener('notification', invalidate);
      source.addEventListener('connected', invalidate);
    } catch {
      // SSE unavailable — polling fallback covers it.
    }

    return () => {
      window.clearInterval(poll);
      source?.close();
    };
  }, [isAuthenticated, queryClient]);

  return <NotificationContext.Provider value={null}>{children}</NotificationContext.Provider>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useNotificationStream = (): null => useContext(NotificationContext);