// Thin client for a local Ollama server. Nothing here is required: callers catch LlmError and use their rule-based fallback.
import { config } from "./config.js";
import { count, timed } from "./metrics.js";

export class LlmError extends Error {}

export interface ToolCall { function: { name: string; arguments: Record<string, unknown> } }
export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: ToolCall[]; tool_name?: string }
export interface ToolSpec { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }

async function post<T>(path: string, body: unknown, timeoutMs: number, baseUrl = config.ollamaUrl): Promise<T> {
  // The key only goes to the chat server; a separate embed server is assumed to be local or private.
  const auth: Record<string, string> = config.ollamaApiKey && baseUrl === config.ollamaUrl ? { authorization: `Bearer ${config.ollamaApiKey}` } : {};
  try {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", ...auth }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new LlmError(`ollama returned ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    count("llm.errors");
    throw err instanceof LlmError ? err : new LlmError(err instanceof Error ? err.message : "ollama unreachable");
  }
}

export interface ChatResult { message: ChatMessage; tokens: number }

// Small models can ramble (qwen3 narrates its reasoning even with think:false), so every call is token-capped and structured where possible.
/** `format` is a JSON schema: the model is constrained to emit JSON of that shape. Temperature 0 keeps parsing and evals repeatable. */
export async function chat(opts: { messages: ChatMessage[]; tools?: ToolSpec[]; format?: Record<string, unknown>; timeoutMs?: number; maxTokens?: number }): Promise<ChatResult> {
  count("llm.calls");
  const r = await timed("llm.chat", () =>
    post<{ message: ChatMessage; eval_count?: number; prompt_eval_count?: number }>(
      "/api/chat",
      { model: config.chatModel, stream: false, think: false, messages: opts.messages, ...(opts.tools && { tools: opts.tools }), ...(opts.format && { format: opts.format }), options: { temperature: 0, num_ctx: 4096, num_predict: opts.maxTokens ?? 400 } },
      opts.timeoutMs ?? config.llmTimeoutMs,
    ),
  );
  const tokens = (r.eval_count ?? 0) + (r.prompt_eval_count ?? 0);
  count("llm.tokens", tokens); // local inference costs nothing, but the token count is what a paid API would bill
  return { message: r.message, tokens };
}

export async function embed(texts: string[], timeoutMs = 30_000): Promise<number[][]> {
  const r = await timed("llm.embed", () => post<{ embeddings: number[][] }>("/api/embed", { model: config.embedModel, input: texts }, timeoutMs, config.ollamaEmbedUrl));
  if (!Array.isArray(r.embeddings) || r.embeddings.length !== texts.length) throw new LlmError("bad embedding response");
  return r.embeddings;
}
