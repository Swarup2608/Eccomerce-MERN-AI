"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, type User } from "@/lib/auth";

// The signed-in user, fetched once per page load and shared by every component (header, account page). Sign-in and
// sign-out update it directly, so the header changes without another round trip.
let current: Promise<User | null> | null = null;
const listeners = new Set<(user: User | null) => void>();

function loadSession(): Promise<User | null> {
  current ??= getCurrentUser().catch(() => null);
  return current;
}

export function setSession(user: User | null): void {
  current = Promise.resolve(user);
  for (const listener of listeners) listener(user);
}

// `undefined` while loading, `null` when signed out.
export function useSession(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    listeners.add(setUser);
    void loadSession().then((loaded) => active && setUser(loaded));
    return () => {
      active = false;
      listeners.delete(setUser);
    };
  }, []);
  return user;
}
