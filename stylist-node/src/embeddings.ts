// Local semantic search: product text is embedded once (npm run embed) and stored in its own collection; queries are embedded on
// demand and compared in memory. A few hundred products need no vector database. If no index exists the stylist uses rules only.
import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "./db.js";
import { config } from "./config.js";
import { categoryIds } from "./catalog.js";
import { embed } from "./llm.js";
import { count, log } from "./metrics.js";
import type { ProductDoc } from "./scoring.js";

const COLLECTION = "stylist_product_vectors";

export function productText(p: ProductDoc): string {
  const attrs = Object.entries(p.attributes ?? {}).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
  return [p.title, p.brand, (p.tags ?? []).join(", "), attrs.join("; "), (p.description ?? "").slice(0, 600)].filter(Boolean).join(". ");
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function buildIndex(onProgress?: (done: number, total: number) => void): Promise<{ indexed: number; skipped: number; total: number }> {
  const db = await getDb();
  const ids = await categoryIds(["dress", "footwear", "accessory"]);
  const products = await db.collection<ProductDoc>("products").find({ status: "active", category: { $in: ids } }).toArray();
  const col = db.collection(COLLECTION);
  const existing = new Map((await col.find({ model: config.embedModel }).project({ hash: 1 }).toArray()).map((d) => [String(d._id), d.hash as string]));
  const stale = products
    .map((p) => ({ p, text: productText(p) }))
    .map((x) => ({ ...x, hash: createHash("sha1").update(x.text).digest("hex") }))
    .filter((x) => existing.get(String(x.p._id)) !== x.hash);
  for (let i = 0; i < stale.length; i += 16) {
    const batch = stale.slice(i, i + 16);
    const vectors = await embed(batch.map((x) => `search_document: ${x.text}`));
    await col.bulkWrite(batch.map((x, j) => ({ replaceOne: { filter: { _id: x.p._id as ObjectId }, replacement: { hash: x.hash, model: config.embedModel, vector: vectors[j]!, updatedAt: new Date() }, upsert: true } })));
    onProgress?.(Math.min(i + 16, stale.length), stale.length);
  }
  // Drop vectors of products that are no longer active, so removed items can never surface.
  const live = new Set(products.map((p) => String(p._id)));
  const gone = [...existing.keys()].filter((id) => !live.has(id)).map((id) => new ObjectId(id));
  if (gone.length) await col.deleteMany({ _id: { $in: gone } });
  // Reload in the background; ranking only ever scores live candidates, so a dropped vector left in the old copy can't surface.
  if (stale.length || gone.length) void warmVectors();
  return { indexed: stale.length, skipped: products.length - stale.length, total: products.length };
}

// Keeps the index in step with the catalog: new and edited products are embedded, removed ones dropped. Only changed text is sent to
// the model (content hashes), so a quiet catalog costs one database read per run. If Ollama is down the run is skipped and retried.
export function startAutoIndex(minutes: number): () => void {
  if (!(minutes > 0)) return () => {};
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await buildIndex();
      count("index.runs");
      if (r.indexed) log("reindex", r);
    } catch (err) {
      count("index.skipped");
      log("reindex_skipped", { reason: err instanceof Error ? err.message : "unknown" });
    } finally {
      running = false;
    }
  };
  void warmVectors();
  const first = setTimeout(run, 5_000);
  const every = setInterval(run, minutes * 60_000);
  first.unref();
  every.unref();
  return () => { clearTimeout(first); clearInterval(every); };
}

let cache: { at: number; byId: Map<string, Float32Array> } | undefined;

let loading: Promise<void> | undefined;

/** Loads every vector into memory; concurrent calls share one load. Resolves (never rejects) once it has finished or failed. */
export function warmVectors(): Promise<void> {
  loading ??= (async () => {
    const t0 = performance.now();
    const docs = await (await getDb()).collection(COLLECTION).find({ model: config.embedModel }).project({ vector: 1 }).toArray();
    cache = { at: Date.now(), byId: new Map(docs.map((d) => [String(d._id), Float32Array.from(d.vector as number[])])) };
    log("vectors_loaded", { count: docs.length, ms: Math.round(performance.now() - t0) });
  })()
    .catch((err) => log("vectors_load_failed", { reason: err instanceof Error ? err.message : "unknown" }))
    .finally(() => { loading = undefined; });
  return loading;
}

// Reading every vector from a remote cluster can take a minute, far past the browser's timeout, so a request never waits for it:
// it uses the copy in memory and a stale copy is refreshed in the background. Until the first load lands, ranking uses rules only.
export async function loadVectors(): Promise<Map<string, Float32Array>> {
  if (!cache || Date.now() - cache.at >= 5 * 60_000) void warmVectors();
  return cache?.byId ?? new Map();
}

const queryCache = new Map<string, number[]>();
export async function queryVector(text: string): Promise<number[]> {
  const key = text.toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;
  const [v] = await embed([`search_query: ${text}`], 10_000);
  if (queryCache.size > 200) queryCache.clear();
  queryCache.set(key, v!);
  return v!;
}
