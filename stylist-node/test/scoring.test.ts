import test from "node:test";
import assert from "node:assert/strict";
import { rank, temperatureBand, type ProductDoc } from "../src/scoring.js";
import { summarise } from "../src/weather.js";
import { validate, BadRequest } from "../src/recommend.js";

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
