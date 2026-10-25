// Structured logs plus in-memory counters (served at /metrics). Enough to see latency, LLM use, fallbacks and token cost.
const counters = new Map<string, number>();
const latencies = new Map<string, number[]>();

export const count = (name: string, by = 1): void => void counters.set(name, (counters.get(name) ?? 0) + by);

export function observe(name: string, ms: number): void {
  const xs = latencies.get(name) ?? [];
  xs.push(ms);
  if (xs.length > 500) xs.shift();
  latencies.set(name, xs);
}

export const percentile = (xs: number[], p: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

export function snapshot() {
  return {
    counters: Object.fromEntries(counters),
    latencyMs: Object.fromEntries([...latencies].map(([k, xs]) => [k, { n: xs.length, p50: percentile(xs, 50), p95: percentile(xs, 95) }])),
  };
}

export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    observe(name, Math.round(performance.now() - t0));
  }
}
