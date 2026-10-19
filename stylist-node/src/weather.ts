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

export async function geocode(city: string): Promise<Place> {
  const data = await getJson<{ results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`,
  );
  const hit = data.results?.[0];
  if (!hit) throw new Error(`could not find a place called "${city}"`);
  return { name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "), lat: hit.latitude, lon: hit.longitude };
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
