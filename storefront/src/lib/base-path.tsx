"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

// The storefront ships two designs: the original at "/" and the redesign under "/v1". Shared client views use this so
// their links and redirects stay inside whichever design the visitor is browsing.
const BaseContext = createContext("");

export function BasePathProvider({ base, children }: { base: string; children: ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

export function useBasePath(): string {
  return useContext(BaseContext);
}

// Returns a function that prefixes an app path ("/cart") with the current base ("/v1/cart").
export function useHref(): (path: string) => string {
  const base = useContext(BaseContext);
  return useCallback((path: string) => (base && path.startsWith("/") ? (path === "/" ? base : `${base}${path}`) : path), [base]);
}
