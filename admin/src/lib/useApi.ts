"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api/client";

interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

// Loads data for `key`, refetching whenever the key changes or reload() is called.
// Loading is derived from which key the current result belongs to, so the effect
// only sets state inside promise callbacks.
export function useApi<T>(key: string, fetcher: () => Promise<T>): ApiState<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ for: string; data: T | null; error: string | null }>({ for: "", data: null, error: null });
  const fetcherRef = useRef(fetcher);
  const requestKey = `${key}#${version}`;

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setResult({ for: requestKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setResult((current) => ({ for: requestKey, data: current.data, error: errorMessage(error) }));
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { data: result.data, error: result.error, loading: result.for !== requestKey, reload };
}
