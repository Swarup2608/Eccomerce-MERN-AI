import type { Occasion } from "./scoring.js";

const OCCASION_WORDS: [RegExp, Occasion][] = [
  [/\bwedding|sangeet|reception|mehendi|engagement\b/, "wedding"],
  [/\bparty|cocktail|club|date night|birthday\b/, "party"],
  [/\boffice|work|business|meeting|interview|formal\b/, "business"],
  [/\btemple|puja|pooja|religious|prayer\b/, "religious"],
  [/\bdiwali|festive|festival|eid|navratri|onam|pongal\b/, "festive"],
  [/\bbeach|resort|pool\b/, "beach"],
  [/\bsightseeing|trip|travel|holiday|vacation|tour\b/, "sightseeing"],
  [/\bcasual|brunch|everyday|daily|college\b/, "casual"],
];
export const COLOR_WORDS = ["black", "white", "grey", "navy", "blue", "red", "green", "beige", "brown", "pink", "yellow"];

export interface ParsedQuery { occasion?: Occasion; colors: string[]; budget?: number }

// Reads a plain sentence like "something for a beach trip in blue under 3000". No LLM: keyword rules only.
export function parseQuery(text: string | undefined): ParsedQuery {
  const q = (text ?? "").toLowerCase();
  const out: ParsedQuery = { colors: COLOR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(q)) };
  const occasion = OCCASION_WORDS.find(([re]) => re.test(q))?.[1];
  if (occasion) out.occasion = occasion;
  const m = q.match(/(?:under|below|within|budget(?: of)?|up ?to|less than|max(?:imum)?|<)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?/);
  if (m?.[1]) {
    const rupees = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (Number.isFinite(rupees) && rupees > 0) out.budget = Math.round(rupees * 100); // the shop stores paise
  }
  return out;
}
