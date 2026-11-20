import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Permission, UserSession } from '../domain';
import { authService } from '../services';

interface AuthContextValue {
  user: UserSession | null;
  login: (id: string, password: string) => Promise<authService.AuthResult>;
  signup: (name: string, id: string, password: string) => Promise<authService.AuthResult>;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(() => authService.getSession());

  const login = useCallback(async (id: string, password: string) => {
    const result = await authService.login(id, password);
    if (result.ok) setUser(result.session);
    return result;
  }, []);

  const signup = useCallback(async (name: string, id: string, password: string) => {
    const result = await authService.signup(name, id, password);
    if (result.ok) setUser(result.session);
    return result;
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const can = useCallback((p: Permission) => authService.hasPermission(user?.role, p), [user]);

  const value = useMemo(() => ({ user, login, signup, logout, can }), [user, login, signup, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Redirects to /login when signed out, and to / when the role lacks `permission`. */
export const ProtectedRoute: React.FC<{ children: React.ReactElement; permission?: Permission }> = ({
  children,
  permission,
}) => {
  const { user, can } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return children;
};
