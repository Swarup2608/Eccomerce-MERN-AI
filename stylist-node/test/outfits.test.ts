import test from "node:test";
import assert from "node:assert/strict";
import { buildOutfits, scoreAddon } from "../src/outfits.js";
import { parseQuery } from "../src/query.js";
import { validateItem } from "../src/wardrobe.js";
import { BadRequest } from "../src/recommend.js";
import type { WardrobeItem } from "../src/wardrobe.js";
import type { ProductDoc } from "../src/scoring.js";

const w = (id: string, category: WardrobeItem["category"], extra: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id, category, name: id, color: "Black", material: "Cotton", fit: "", length: "", occasions: ["Casual"], description: "", image: "data:image/png;base64,AA", createdAt: "", ...extra,
});
const hot = { avgC: 34, rainyDays: 0 };

test("query: budget, occasion and colours", () => {
  assert.deepEqual(parseQuery("something blue for a beach trip under ₹3,000"), { colors: ["blue"], occasion: "beach", budget: 300000 });
  assert.equal(parseQuery("office wear below 2.5k").budget, 250000);
  assert.deepEqual(parseQuery(""), { colors: [] });
});

test("wardrobe: picks the dress that suits the weather and completes it with owned shoes", () => {
  const items = [w("wool", "dress", { material: "Wool" }), w("linen", "dress", { material: "Linen", fit: "Relaxed" }), w("shoes", "footwear")];
  const [best] = buildOutfits(items, { occasion: "casual", weather: hot });
  assert.deepEqual(best?.itemIds, ["linen", "shoes"]);
});

test("wardrobe: pairs a top with a bottom", () => {
  const out = buildOutfits([w("tee", "top", { color: "White" }), w("jeans", "bottom", { material: "Denim", color: "Navy" })], { occasion: "casual", weather: undefined });
  assert.deepEqual(out[0]?.itemIds.sort(), ["jeans", "tee"]);
});

test("wardrobe: an empty or unsuitable wardrobe gives no outfits", () => {
  assert.equal(buildOutfits([], { occasion: "casual", weather: hot }).length, 0);
  assert.equal(buildOutfits([w("wool", "dress", { material: "Wool", occasions: ["Work"] })], { occasion: "party", weather: hot }).length, 0);
});

test("add-ons: occasion fit and colour harmony", () => {
  const shoe = { title: "x", variants: [{ isActive: true, stock: 1, price: 1, options: { color: "Black" } }] } as ProductDoc;
  const ctx = { occasion: "business" as const, weather: undefined };
  assert.ok(scoreAddon(shoe, "formal-shoes", ctx, ["red"]).score > scoreAddon(shoe, "sneakers", ctx, ["red"]).score);
  assert.equal(scoreAddon(shoe, "unknown", ctx, []).score, 0);
});

test("wardrobe validation", () => {
  const ok = { name: "Blue dress", category: "dress", image: "data:image/jpeg;base64,/9j/AA==", occasions: ["Party"] };
  assert.equal(validateItem(ok).name, "Blue dress");
  assert.throws(() => validateItem({ ...ok, image: "https://evil.example/x.jpg" }), BadRequest);
  assert.throws(() => validateItem({ ...ok, category: "spaceship" }), BadRequest);
  assert.throws(() => validateItem({ ...ok, occasions: ["Funeral"] }), BadRequest);
  assert.throws(() => validateItem({ ...ok, name: " " }), BadRequest);
});
