'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export interface AuthUser {
  id: number;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  email: string;
  role: string;
  status: string;
  department?: any;
  agency?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  avatar?: string | null;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  hasPermission: (code: string) => boolean;
  isSuperAdmin: boolean;
  signIn: (user: AuthUser) => void;
  refresh: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  hasPermission: () => false,
  isSuperAdmin: false,
  signIn: () => {},
  refresh: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (res.status === 401) {
        setUser(null);
        return null;
      }
      const json = await res.json();
      if (json.ok) {
        setUser(json.data as AuthUser);
        return json.data as AuthUser;
      }
      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback((data: AuthUser) => {
    setUser(data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const hasPermission = useCallback(
    (code: string) => {
      if (!user) return false;
      if (user.role === 'SUPER_ADMIN') return true;
      return user.permissions.includes(code);
    },
    [user]
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
    setError(null);
    window.location.assign('/login');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        hasPermission,
        isSuperAdmin: !!user && user.role === 'SUPER_ADMIN',
        signIn,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}