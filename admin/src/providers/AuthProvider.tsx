"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import { ADMIN_ROLES, getCurrentUser, login, logout, superAdminLogin, type AuthUser } from "@/lib/api/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  signIn: (mode: "admin" | "super_admin", identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Only staff with an admin role may use this app; anyone else is signed straight out.
function isAdmin(user: AuthUser | null): user is AuthUser {
  return Boolean(user && ADMIN_ROLES.includes(user.role));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((response) => {
        if (!cancelled) setUser(isAdmin(response.data.user) ? response.data.user : null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (mode: "admin" | "super_admin", identifier: string, password: string) => {
    if (mode === "super_admin") {
      await superAdminLogin(identifier, password);
    } else {
      await login(identifier, password);
    }

    // /auth/me returns the same shape for both login types.
    const { data } = await getCurrentUser();

    if (!isAdmin(data.user)) {
      await logout().catch(() => undefined);
      throw new ApiError("This account does not have admin access.", 403, "FORBIDDEN");
    }

    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, isLoading, isSuperAdmin: user?.role === "super_admin", signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}
