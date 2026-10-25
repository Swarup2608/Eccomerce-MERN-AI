// Hybrid ranking: the rule score (weather, occasion, material ...) plus semantic similarity to the request, plus the shopper's likes,
// then a diversity pass so five near-identical shirts don't fill the list. Disliked products never appear.
import { loadVectors, cosine, queryVector } from "./embeddings.js";
import { log } from "./metrics.js";
import { scoreProduct, type Ctx, type ProductDoc, type Ranked } from "./scoring.js";
import type { Prefs } from "./feedback.js";

export interface HybridOptions { semanticQuery?: string; prefs?: Prefs; limit: number; /** Rank products that have photos above those without. */ preferImages?: boolean }

const idOf = (p: ProductDoc) => String(p._id);

function minMax(xs: number[]): (x: number) => number {
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return (x) => (hi - lo < 1e-9 ? 0 : (x - lo) / (hi - lo));
}

/** Greedy maximal-marginal-relevance: take the best, then keep penalising anything too close to what is already chosen. */
export function selectDiverse<T extends { score: number }>(items: T[], similarity: (a: T, b: T) => number, limit: number, penalty = 30): T[] {
  const left = [...items].sort((a, b) => b.score - a.score);
  const chosen: T[] = [];
  while (chosen.length < limit && left.length) {
    let best = 0, bestAdj = -Infinity;
    left.forEach((c, i) => {
      const near = chosen.reduce((m, s) => Math.max(m, similarity(c, s)), 0);
      const adj = c.score - penalty * Math.max(0, near - 0.75) / 0.25;
      if (adj > bestAdj) { bestAdj = adj; best = i; }
    });
    chosen.push(left.splice(best, 1)[0]!);
  }
  return chosen;
}

export async function rankHybrid(products: ProductDoc[], ctx: Ctx, o: HybridOptions): Promise<Ranked[]> {
  const disliked = new Set(o.prefs?.disliked ?? []);
  let ranked = products.filter((p) => !disliked.has(idOf(p))).map((product) => ({ product, ...scoreProduct(product, ctx) }));
  if (!ranked.length) return [];
  if (o.preferImages) ranked = ranked.map((r) => (r.product.images?.[0]?.url ? { ...r, score: r.score + 40, reasons: [...r.reasons, "has photos"] } : { ...r, score: r.score - 40 }));

  let vectors = new Map<string, Float32Array>();
  try { vectors = await loadVectors(); } catch { /* no index: rules only */ }

  const query = o.semanticQuery?.trim();
  if (query && vectors.size) {
    try {
      const qv = await queryVector(query);
      const sims = ranked.map((r) => { const v = vectors.get(idOf(r.product)); return v ? cosine(qv, v) : null; });
      const present = sims.filter((s): s is number => s !== null);
      if (present.length > 1) {
        const norm = minMax(present);
        ranked = ranked.map((r, i) => {
          const s = sims[i];
          if (s == null) return r;
          const n = norm(s);
          return { ...r, score: r.score + 30 * n, reasons: n > 0.8 ? [...r.reasons, `closely matches "${query}"`] : r.reasons };
        });
      }
    } catch (err) {
      log("semantic_skipped", { reason: err instanceof Error ? err.message : "unknown" });
    }
  }

  const likedVecs = (o.prefs?.liked ?? []).map((id) => vectors.get(id)).filter((v): v is Float32Array => !!v);
  if (likedVecs.length) {
    const centroid = likedVecs[0]!.map((_, d) => likedVecs.reduce((s, v) => s + v[d]!, 0) / likedVecs.length);
    const sims = ranked.map((r) => { const v = vectors.get(idOf(r.product)); return v ? cosine(centroid, v) : null; });
    const present = sims.filter((s): s is number => s !== null);
    if (present.length > 1) {
      const norm = minMax(present);
      ranked = ranked.map((r, i) => {
        const s = sims[i];
        if (s == null) return r;
        const n = norm(s);
        return { ...r, score: r.score + 12 * n, reasons: n > 0.8 ? [...r.reasons, "similar to pieces you liked"] : r.reasons };
      });
    }
  }

  const positive = ranked.filter((r) => r.score > 0);
  const similarity = (a: Ranked, b: Ranked) => {
    const va = vectors.get(idOf(a.product)), vb = vectors.get(idOf(b.product));
    return va && vb ? cosine(va, vb) : 0;
  };
  return selectDiverse(positive, similarity, o.limit);
}
