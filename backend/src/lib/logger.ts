import type { LogLevel } from "../config/env.js";

type Meta = Record<string, unknown>;

export interface Logger {
  debug(message: string, meta?: Meta): void;
  info(message: string, meta?: Meta): void;
  warn(message: string, meta?: Meta): void;
  error(message: string, meta?: Meta): void;
  child(bindings: Meta): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session|credential|uri$/i;
const MAX_DEPTH = 6;

function sanitize(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));

  const output: Meta = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[Redacted]" : sanitize(item, depth + 1);
  }
  return output;
}

export function createLogger(level: LogLevel, bindings: Meta = {}): Logger {
  const threshold = LEVEL_WEIGHT[level];

  const write = (entryLevel: LogLevel, message: string, meta?: Meta): void => {
    if (LEVEL_WEIGHT[entryLevel] < threshold) return;
    const entry = { time: new Date().toISOString(), level: entryLevel, msg: message, ...bindings, ...meta };
    const line = `${JSON.stringify(sanitize(entry))}\n`;
    if (LEVEL_WEIGHT[entryLevel] >= LEVEL_WEIGHT.warn) process.stderr.write(line);
    else process.stdout.write(line);
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    child: (childBindings) => createLogger(level, { ...bindings, ...childBindings }),
  };
}
