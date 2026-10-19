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
export interface SuggestRequest { query?: string; source: Source; budget?: number; occasion?: string; startDate?: string; endDate?: string; city?: string }
export interface SuggestResult { source: Source; occasion: string; budget: number | null; place: string | null; weather: { avgC: number; minC: number; maxC: number; rainyDays: number; band: string; source: string } | null; notes: string[]; store: Suggestion[]; outfits: Outfit[] }

// Same cookie session as the shop API; an expired access token is refreshed once, like authFetch.
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () =>
    fetch(`${env.stylistUrl}/api/v1/stylist${path}`, {
      ...init,
      credentials: "include",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new ApiError(res.status, "STYLIST", body?.error ?? "Request failed");
}

export const stylistApi = {
  wardrobe: async () => (await call<{ items: WardrobeItem[] }>("/wardrobe")).items,
  addItem: async (item: WardrobeInput) => (await call<{ item: WardrobeItem }>("/wardrobe", { method: "POST", body: JSON.stringify(item) })).item,
  removeItem: (id: string) => call<void>(`/wardrobe/${id}`, { method: "DELETE" }),
  suggest: (request: SuggestRequest) => call<SuggestResult>("/suggest", { method: "POST", body: JSON.stringify(request) }),
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
