"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/auth";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

// Runs `load` on mount and whenever it changes (wrap it in useCallback with its inputs), keeping the last good data
// while a reload is in flight. A stale response from an older `load` never overwrites a newer one.
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (result) => {
        if (!current) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (!current) return;
        setError(errorMessage(err));
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [load, version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((value) => value + 1);
  }, []);

  return { data, error, loading, reload, setData };
}
