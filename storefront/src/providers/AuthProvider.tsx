"use client";

import { createContext, useCallback, useContext, useEffect, useState,type ReactNode } from "react";
import {ApiError} from "../lib/api/client";
import {getCurrentUser, login as loginApi, logout as logoutApi , refreshSession, type AuthResponse, type AuthUser, type LoginInput} from "../lib/api/auth";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  signIn: (input: LoginInput) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await getCurrentUser();
      setUser(response.data.user);
    } catch (error: unknown) {
      if (!(error instanceof ApiError) || error.statusCode !== 401) {
        throw error;
      }

      try {
        await refreshSession();

        const response = await getCurrentUser();
        setUser(response.data.user);
      } catch {
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        await refreshUser();
      } catch {
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const signIn = useCallback(async (input: LoginInput) => {
    const response = await loginApi(input);
    setUser(response.data.user);
    setIsLoading(false);
    return response;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    refreshUser,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return context;
}