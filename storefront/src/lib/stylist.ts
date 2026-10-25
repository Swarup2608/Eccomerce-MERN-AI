import { ApiError } from "@/lib/api";
import { refreshSession } from "@/lib/auth";
import { env } from "@/lib/env";

export const CATEGORIES = [
  { value: "dress", label: "Dress" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "ethnic", label: "Ethnic wear" },
  { value: "outerwear", label: "Jacket / outerwear" },
  { value: "footwear", label: "Footwear" },
  { value: "accessory", label: "Accessory" },
] as const;
export const WARDROBE_OCCASIONS = ["Casual", "Party", "Work", "Festive"] as const;
export const OCCASIONS = ["casual", "sightseeing", "business", "wedding", "party", "religious", "beach", "festive"] as const;
export const GENDERS = [{ value: "women", label: "Women" }, { value: "men", label: "Men" }] as const;
export type Gender = (typeof GENDERS)[number]["value"];
export type Source = "store" | "wardrobe" | "addons";

export interface WardrobeInput {
  name: string;
  category: (typeof CATEGORIES)[number]["value"];
  color: string;
  material: string;
  fit: string;
  length: string;
  occasions: string[];
  description: string;
  image: string;
}
export interface WardrobeItem extends WardrobeInput { id: string; createdAt: string }

export interface Suggestion { id: string; title: string; brand?: string; slug?: string; price?: number; image: string | null; score: number; reasons: string[]; sizes: (string | undefined)[] }
export interface Outfit { itemIds: string[]; score: number; reasons: string[]; addons: { slot: string; options: Suggestion[] }[] }
export interface SuggestRequest { query?: string; gender?: Gender; preferImages?: boolean; explain?: boolean; source: Source; budget?: number; occasion?: string; occasionDetails?: string; startDate?: string; endDate?: string; city?: string }
export interface SuggestResult { source: Source; occasion: string; budget: number | null; place: string | null; weather: { avgC: number; minC: number; maxC: number; rainyDays: number; band: string; source: string } | null; notes: string[]; store: Suggestion[]; outfits: Outfit[]; summary: string; intent: "llm" | "rules" }
export type Feedback = "like" | "dislike";
export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface ChatResult { reply: string; products: Suggestion[]; total: number; mode: "agent" | "fallback" }

// Same cookie session as the shop API; an expired access token is refreshed once, like authFetch.
async function request(path: string, init: RequestInit, timeoutMs: number, accept = "application/json"): Promise<Response> {
  const send = () =>
    fetch(`${env.stylistUrl}/api/v1/stylist${path}`, {
      ...init,
      credentials: "include",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: accept, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (res.ok) return res;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new ApiError(res.status, "STYLIST", body?.error ?? "Request failed");
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const res = await request(path, init, timeoutMs);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

type ChatEvent = { type: "progress"; text: string } | { type: "result"; result: ChatResult } | { type: "error"; error: string };

// Reads the newline-delimited stream: progress lines while the agent works, then the checked answer.
async function chatStream(messages: ChatTurn[], gender: Gender | undefined, onProgress: (text: string) => void): Promise<ChatResult> {
  const res = await request("/chat", { method: "POST", body: JSON.stringify({ messages, ...(gender && { gender }) }) }, 50_000, "application/x-ndjson");
  if (!res.body) throw new ApiError(502, "STYLIST", "The stylist didn't answer");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line) as ChatEvent;
      if (event.type === "progress") onProgress(event.text);
      else if (event.type === "result") return event.result;
      else throw new ApiError(502, "STYLIST", event.error);
    }
    if (done) throw new ApiError(502, "STYLIST", "The stylist stopped before answering");
  }
}

export const stylistApi = {
  wardrobe: async () => (await call<{ items: WardrobeItem[] }>("/wardrobe")).items,
  addItem: async (item: WardrobeInput) => (await call<{ item: WardrobeItem }>("/wardrobe", { method: "POST", body: JSON.stringify(item) })).item,
  removeItem: (id: string) => call<void>(`/wardrobe/${id}`, { method: "DELETE" }),
  // The service may wait on the local model (intent, then the optional summary), so allow longer than plain API calls.
  suggest: (request: SuggestRequest) => call<SuggestResult>("/suggest", { method: "POST", body: JSON.stringify(request) }, 45_000),
  // The chat agent has a 35 s budget on the server; it answers with a rule-based fallback rather than timing out.
  /** Reports what the agent is doing ("Searching the shop for ...") while it works, then resolves with the checked answer. */
  chatStream,
  /** "clear" removes an earlier like or dislike. */
  feedback: (productId: string, value: Feedback | "clear") => call<void>("/feedback", { method: "POST", body: JSON.stringify({ productId, value }) }),
};

// Shrinks a photo in the browser before upload (about 80 KB instead of several MB), so storage and bandwidth stay cheap.
export async function shrinkImage(file: File, maxSide = 800): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That photo couldn't be read. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
