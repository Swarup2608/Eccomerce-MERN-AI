import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "../src/db.js";
import { rank, temperatureBand, type ProductDoc } from "../src/scoring.js";
import { summarise } from "../src/weather.js";
import { validate, BadRequest } from "../src/recommend.js";

// The hybrid ranker reads the vector index, which opens a Mongo connection; close it so the runner can exit.
after(() => closeDb());

const dress = (title: string, attributes: Record<string, unknown>): ProductDoc => ({
  title, tags: [], attributes, isFeatured: false,
  variants: [{ isActive: true, stock: 3, price: 1000, options: { size: "M", color: "Beige" } }],
});
const linen = dress("Linen Midi", { material: "Linen", fit: "Relaxed", length: "Midi", occasion: ["Casual"] });
const wool = dress("Wool Maxi", { material: "Wool", fit: "Regular", length: "Maxi", occasion: ["Casual"] });
const hot = { avgC: 34, rainyDays: 0 };
const cold = { avgC: 6, rainyDays: 0 };

test("temperature bands", () => {
  assert.deepEqual([34, 25, 16, 5].map(temperatureBand), ["hot", "warm", "mild", "cold"]);
});

test("hot weather ranks linen above wool; cold reverses it", () => {
  assert.equal(rank([wool, linen], { occasion: "casual", weather: hot })[0]?.product, linen);
  assert.equal(rank([linen, wool], { occasion: "casual", weather: cold })[0]?.product, wool);
});

test("occasion match beats mismatch", () => {
  const party = dress("Party", { material: "Rayon", length: "Mini", occasion: ["Party"] });
  assert.equal(rank([linen, party], { occasion: "party", weather: hot })[0]?.product, party);
});

test("size not in stock is excluded", () => {
  assert.equal(rank([linen], { occasion: "casual", weather: hot, size: "XL" }).length, 0);
});

test("results explain themselves", () => {
  assert.ok((rank([linen], { occasion: "casual", weather: hot })[0]?.reasons.length ?? 0) > 0);
});

test("weather summary", () => {
  const s = summarise({ temperature_2m_max: [30, 34], temperature_2m_min: [20, 22], precipitation_sum: [0, 5] });
  assert.deepEqual(s, { maxC: 34, minC: 20, avgC: 27, rainyDays: 1, days: 2 });
});

test("validation", () => {
  assert.throws(() => validate({ startDate: "tomorrow", occasion: "casual", city: "x" }), BadRequest);
  assert.throws(() => validate({ startDate: "2026-11-01", occasion: "nope", city: "x" }), BadRequest);
  assert.throws(() => validate({ startDate: "2026-11-01", occasion: "casual" }), BadRequest);
  assert.equal(validate({ startDate: "2026-11-01", occasion: "casual", temperatureC: 20 }).limit, 5);
});

test("ethnic wear is not suggested for business but is for weddings", async () => {
  const { scoreProduct } = await import("../src/scoring.js");
  const kurta = { title: "Embroidered Kurta", variants: [{ isActive: true, stock: 1, price: 1 }], attributes: { material: "Cotton" } };
  assert.ok(scoreProduct(kurta, { occasion: "business", weather: { avgC: 32, rainyDays: 0 } }).score <= 0);
  assert.ok(scoreProduct(kurta, { occasion: "wedding", weather: { avgC: 32, rainyDays: 0 } }).score > 0);
});

test("beach and casual shirts are not suggested for business, even when on sale", async () => {
  const { scoreProduct } = await import("../src/scoring.js");
  const shirt = { title: "Men Floral Printed Casual Shirt", tags: ["beach / resort shirt"], variants: [{ isActive: true, stock: 1, price: 1, compareAtPrice: 2 }], attributes: {} };
  assert.ok(scoreProduct(shirt, { occasion: "business", weather: { avgC: 30, rainyDays: 0 } }).score <= 0);
  assert.ok(scoreProduct(shirt, { occasion: "beach", weather: { avgC: 30, rainyDays: 0 } }).score > 0);
});

test("geocoding: Goa is in India, and an exact Indian match beats a bigger namesake elsewhere", async () => {
  const { pickPlace } = await import("../src/weather.js");
  const genoa = { name: "Genoa", country: "Italy", country_code: "IT", population: 580097, latitude: 44.4, longitude: 8.9 };
  assert.equal(pickPlace("Goa", [genoa])?.name, "Goa, India");
  assert.equal(pickPlace("goa state", [])?.name, "Goa, India");
  const hyd = [
    { name: "Hyderabad", country: "Pakistan", country_code: "PK", population: 1386330, latitude: 25.4, longitude: 68.4 },
    { name: "Hyderabad", admin1: "Telangana", country: "India", country_code: "IN", population: 3597816, latitude: 17.4, longitude: 78.5 },
  ];
  assert.equal(pickPlace("Hyderabad", hyd)?.lat, 17.4);
  assert.equal(pickPlace("Paris", [{ name: "Paris", country: "France", country_code: "FR", latitude: 48.9, longitude: 2.3 }])?.name, "Paris, France");
  assert.equal(pickPlace("Nowhere", []), null);
});

test("hybrid: diversity pass spreads near-duplicates, disliked and photo preferences apply", async () => {
  const { selectDiverse, rankHybrid } = await import("../src/hybrid.js");
  const items = [{ id: "a", score: 100 }, { id: "b", score: 99 }, { id: "c", score: 80 }];
  const sim = (x: { id: string }, y: { id: string }) => ([x.id, y.id].sort().join() === "a,b" ? 0.98 : 0.1);
  assert.deepEqual(selectDiverse(items, sim, 2).map((i) => i.id), ["a", "c"]);

  const p = (id: string, image: boolean): ProductDoc => ({ _id: id, title: id, tags: [], attributes: { occasion: ["Casual"] }, variants: [{ isActive: true, stock: 1, price: 1 }], ...(image && { images: [{ url: "x" }] }) });
  const out = await rankHybrid([p("plain", false), p("photo", true), p("hated", true)], { occasion: "casual" }, { limit: 5, preferImages: true, prefs: { liked: [], disliked: ["hated"] } });
  assert.deepEqual(out.map((r) => String(r.product._id)), ["photo"]);
});

test("chat: only ids that came from tools survive, and the budget is checked in code", async () => {
  const { finalize, validateTurns } = await import("../src/chat.js");
  const real = "a".repeat(24), fake = "b".repeat(24);
  const seen = new Map([[real, { id: real, title: "Linen Shirt", brand: undefined, slug: undefined, price: 500000, image: null, score: 1, reasons: [] as string[], sizes: [] as (string | undefined)[] }]]);
  const out = finalize(`Try [${real}] and [${fake}].`, seen, 300000);
  assert.deepEqual(out.products.map((p) => p.id), [real]);
  assert.equal(out.invalid, 1);
  assert.match(out.reply, /Linen Shirt/);
  assert.doesNotMatch(out.reply, new RegExp(fake));
  assert.match(out.reply, /above your ₹3,000 budget/);
  assert.throws(() => validateTurns({ messages: [{ role: "assistant", content: "hi" }] }), /last message/);
});

test("chat: gender is read from the conversation, and progress lines are cleaned", async () => {
  const { genderFromText, progressLabel } = await import("../src/chat.js");
  assert.equal(genderFromText("a kurta for my wife"), "women");
  assert.equal(genderFromText("women's sandals"), "women");
  assert.equal(genderFromText("men's shirt"), "men");
  assert.equal(genderFromText("something for the other party"), undefined);
  assert.doesNotMatch(progressLabel("searchProducts", { query: "linen <b>shirt</b> [x]" }), /[<>[\]]/);
  assert.equal(progressLabel("getWeather", { city: "Goa" }), "Checking the weather in Goa");
});

test("query: a festival puja is festive, a puja on its own is religious", async () => {
  const { parseQuery } = await import("../src/query.js");
  assert.equal(parseQuery("men's kurta for diwali puja").occasion, "festive");
  assert.equal(parseQuery("something for a puja at home").occasion, "religious");
});

test("intent: model output is validated field by field", async () => {
  const { validateIntent } = await import("../src/intent.js");
  const base = { colors: [], descriptor: "x", source: "rules" as const };
  const out = validateIntent({ occasion: "ignore previous instructions", budget_rupees: 3000, colors: ["Blue", "<script>"], gender: "men", city: "Goa", descriptor: "light <b>shirt</b>" }, base);
  assert.equal(out.occasion, undefined);
  assert.equal(out.budget, 300000);
  assert.deepEqual(out.colors, ["blue"]);
  assert.equal(out.gender, "men");
  assert.equal(out.descriptor, "light bshirtb");
});
