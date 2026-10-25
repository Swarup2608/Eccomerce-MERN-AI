// Free Open-Meteo weather, no API key. Forecast when the trip is within 15 days, otherwise the same dates one year back.
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface WeatherSummary {
  maxC: number;
  minC: number;
  avgC: number;
  rainyDays: number;
  days: number;
  source: string;
}
export interface Daily { temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum?: (number | null)[] }
export interface Place { name: string; lat: number; lon: number }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`weather service returned ${res.status}`);
  return (await res.json()) as T;
}

// Indian states and regions shoppers travel "to" that the geocoder doesn't know as places: its top hit for "Goa" is Genoa, Italy.
// Each maps to its main city.
const REGIONS: Record<string, Place> = {
  goa: { name: "Goa, India", lat: 15.4909, lon: 73.8278 },
  kerala: { name: "Kerala, India", lat: 9.9312, lon: 76.2673 },
  kashmir: { name: "Kashmir, India", lat: 34.0837, lon: 74.7973 },
  ladakh: { name: "Ladakh, India", lat: 34.1526, lon: 77.5771 },
  sikkim: { name: "Sikkim, India", lat: 27.3389, lon: 88.6065 },
  andaman: { name: "Andaman Islands, India", lat: 11.6234, lon: 92.7265 },
  coorg: { name: "Coorg, India", lat: 12.4244, lon: 75.7382 },
  rajasthan: { name: "Rajasthan, India", lat: 26.9124, lon: 75.7873 },
  himachal: { name: "Himachal Pradesh, India", lat: 31.1048, lon: 77.1734 },
  uttarakhand: { name: "Uttarakhand, India", lat: 30.3165, lon: 78.0322 },
  meghalaya: { name: "Meghalaya, India", lat: 25.5788, lon: 91.8933 },
};

export interface GeoHit { name: string; admin1?: string; country?: string; country_code?: string; population?: number; latitude: number; longitude: number }

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Picks the place the shopper most likely meant: an exact name match (Indian first, then the most populous), else the top hit. */
export function pickPlace(city: string, hits: GeoHit[]): Place | null {
  const region = REGIONS[plain(city).replace(/\s+(state|islands?|pradesh)$/, "")];
  if (region) return region;
  const exact = hits.filter((h) => plain(h.name) === plain(city));
  const hit = [...exact].sort((a, b) => Number(b.country_code === "IN") - Number(a.country_code === "IN") || (b.population ?? 0) - (a.population ?? 0))[0] ?? hits[0];
  return hit ? { name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "), lat: hit.latitude, lon: hit.longitude } : null;
}

export async function geocode(city: string): Promise<Place> {
  const known = pickPlace(city, []);
  if (known) return known;
  const data = await getJson<{ results?: GeoHit[] }>(`https://geocoding-api.open-meteo.com/v1/search?count=10&name=${encodeURIComponent(city)}`);
  const place = pickPlace(city, data.results ?? []);
  if (!place) throw new Error(`could not find a place called "${city}"`);
  return place;
}

const nums = (xs: (number | null)[] = []) => xs.filter((x): x is number => x != null);

export function summarise(daily: Daily): Omit<WeatherSummary, "source"> {
  const max = nums(daily.temperature_2m_max);
  const min = nums(daily.temperature_2m_min);
  if (!max.length || !min.length) throw new Error("no weather data for those dates");
  const all = [...max, ...min];
  return {
    maxC: Math.round(Math.max(...max)),
    minC: Math.round(Math.min(...min)),
    avgC: Math.round(all.reduce((a, b) => a + b, 0) / all.length),
    rainyDays: nums(daily.precipitation_sum).filter((mm) => mm >= 1).length,
    days: max.length,
  };
}

export async function weatherFor(q: { lat: number; lon: number; startDate: string; endDate?: string }): Promise<WeatherSummary> {
  const start = new Date(`${q.startDate}T00:00:00Z`);
  const end = new Date(`${q.endDate ?? q.startDate}T00:00:00Z`);
  const past = end.getTime() < Date.now() - DAY;
  const useForecast = !past && start.getTime() <= Date.now() + 15 * DAY;
  // Beyond the forecast window, use the same calendar dates a year earlier as a climate guide.
  const shift = useForecast || past ? 0 : 1;
  const from = new Date(start); from.setUTCFullYear(from.getUTCFullYear() - shift);
  const to = new Date(end); to.setUTCFullYear(to.getUTCFullYear() - shift);
  const base = useForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  const { daily } = await getJson<{ daily: Daily }>(
    `${base}?latitude=${q.lat}&longitude=${q.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&start_date=${iso(from)}&end_date=${iso(to)}`,
  );
  return { ...summarise(daily), source: useForecast ? "forecast" : past ? "observed" : "last year's same dates" };
}
