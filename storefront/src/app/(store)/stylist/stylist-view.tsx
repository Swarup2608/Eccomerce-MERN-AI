"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { Thumb } from "@/components/stylist-bits";
import { Button, EmptyState, Field, Input, Notice, Select } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { formatInr } from "@/lib/money";
import { GENDERS, OCCASIONS, stylistApi, type Gender, type Source, type Suggestion, type SuggestResult, type WardrobeItem } from "@/lib/stylist";

const SOURCES: { value: Source; label: string; hint: string }[] = [
  { value: "store", label: "Only from the shop", hint: "New pieces you can buy" },
  { value: "wardrobe", label: "Only from my wardrobe", hint: "Outfits from what you own" },
  { value: "addons", label: "My wardrobe + add-ons", hint: "Your clothes, plus shop pieces to complete them" },
];

function ProductLink({ s }: { s: Suggestion }) {
  const body = (
    <>
      <Thumb src={s.image} label={s.title} />
      <span className="mt-2 block truncate text-sm font-semibold">{s.title}</span>
      <span className="block text-sm tabular-nums">{s.price !== undefined ? formatInr(s.price) : null}{s.brand ? <span className="text-foreground/60"> · {s.brand}</span> : null}</span>
    </>
  );
  return (
    <article className="flex min-w-0 flex-col">
      {s.slug ? <Link href={`/products/${s.slug}`} className="no-underline hover:text-accent-700">{body}</Link> : body}
      {s.reasons.length ? <ul className="m-0 mt-1.5 list-none p-0 text-xs text-foreground/65">{s.reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul> : null}
      {s.slug ? <Link href={`/products/${s.slug}`} className="mt-2 text-sm font-medium text-accent-700 underline underline-offset-4">View in shop</Link> : null}
    </article>
  );
}

export function StylistView() {
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [source, setSource] = useState<Source>("store");
  const [gender, setGender] = useState<Gender | "">("");
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("");
  const [occasion, setOccasion] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuggestResult | null>(null);

  useEffect(() => {
    let current = true;
    stylistApi.wardrobe().then((items) => current && setWardrobe(items), () => undefined);
    return () => {
      current = false;
    };
  }, []);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rupees = Number(budget);
      setResult(
        await stylistApi.suggest({
          source,
          ...(gender && { gender }),
          ...(query.trim() && { query: query.trim() }),
          ...(budget && Number.isFinite(rupees) && rupees > 0 && { budget: Math.round(rupees * 100) }),
          ...(occasion && { occasion }),
          ...(city.trim() && startDate && { city: city.trim(), startDate, ...(endDate && { endDate }) }),
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const owned = new Map(wardrobe.map((w) => [w.id, w]));

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={ask} className="flex flex-col gap-4 self-start" aria-label="Ask the stylist">
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium">Styling for</legend>
          <div className="grid grid-cols-2 gap-3">
            {GENDERS.map((g) => (
              <label key={g.value} className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 text-sm ${gender === g.value ? "border-foreground" : "border-foreground/20"}`}>
                <input type="radio" name="gender" required checked={gender === g.value} onChange={() => setGender(g.value)} />
                <span className="font-semibold">{g.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="What are you looking for?" hint='Try "something light for a beach trip under 3000".'>
          <textarea className="input min-h-24 py-2" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={300} />
        </Field>
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium">Suggest from</legend>
          {SOURCES.map((s) => (
            <label key={s.value} className={`flex min-h-11 cursor-pointer items-start gap-3 border px-3 py-2 text-sm ${source === s.value ? "border-foreground" : "border-foreground/20"}`}>
              <input type="radio" name="source" className="mt-1" checked={source === s.value} onChange={() => setSource(s.value)} />
              <span><b className="font-semibold">{s.label}</b><br /><span className="text-foreground/60">{s.hint}</span></span>
            </label>
          ))}
        </fieldset>
        {source !== "store" && wardrobe.length === 0 ? (
          <Notice tone="amber">Your wardrobe is empty. <Link href="/stylist/wardrobe" className="underline">Add some pieces</Link> first.</Notice>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={source === "addons" ? "Add-on budget (₹)" : "Budget (₹)"}><Input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder="3000" disabled={source === "wardrobe"} /></Field>
          <Field label="Occasion">
            <Select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              <option value="">Let the stylist decide</option>
              {OCCASIONS.map((o) => <option key={o} value={o}>{o[0]!.toUpperCase() + o.slice(1)}</option>)}
            </Select>
          </Field>
          <Field label="Where"><Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="Goa" /></Field>
          <Field label="From"><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
          <Field label="To" className="col-start-2"><Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></Field>
        </div>
        <FormError message={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Styling..." : "Suggest outfits"}</Button>
      </form>

      <section aria-live="polite" aria-label="Suggestions">
        {!result ? (
          <EmptyState title="Tell the stylist about the trip" text="Pick where the clothes should come from, add a place and dates for weather-aware picks, and ask." />
        ) : (
          <div className="flex flex-col gap-8">
            <p className="m-0 text-sm text-foreground/70">
              {result.occasion[0]!.toUpperCase() + result.occasion.slice(1)}
              {result.place ? ` · ${result.place}` : ""}
              {result.weather ? ` · ${result.weather.minC}–${result.weather.maxC}°C${result.weather.rainyDays ? `, rain on ${result.weather.rainyDays} day${result.weather.rainyDays > 1 ? "s" : ""}` : ""}` : ""}
              {result.budget ? ` · up to ${formatInr(result.budget)}` : ""}
            </p>
            {result.notes.map((n) => <Notice key={n} tone="amber">{n}</Notice>)}
            {result.store.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-x-4 gap-y-8">
                {result.store.map((s) => <ProductLink key={s.id} s={s} />)}
              </div>
            ) : null}
            {result.outfits.map((outfit, n) => (
              <article key={outfit.itemIds.join("-")} className="flex flex-col gap-4 border border-divider p-5">
                <h3 className="m-0 text-xl">Outfit {n + 1}</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,150px))] gap-3">
                  {outfit.itemIds.map((id) => {
                    const item = owned.get(id);
                    return (
                      <figure key={id} className="m-0 min-w-0">
                        <Thumb src={item?.image ?? null} label={item?.name ?? "Wardrobe item"} />
                        <figcaption className="mt-1 truncate text-xs">{item?.name ?? "Wardrobe item"}</figcaption>
                      </figure>
                    );
                  })}
                </div>
                {outfit.reasons.length ? <ul className="m-0 list-none p-0 text-sm text-foreground/70">{outfit.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul> : null}
                {outfit.addons.map((slot) => (
                  <div key={slot.slot} className="flex flex-col gap-3">
                    <h4 className="m-0 text-xs uppercase tracking-[0.14em] text-accent-700">{slot.slot === "footwear" ? "Footwear to complete it" : "Finishing touch"}</h4>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
                      {slot.options.map((s) => <ProductLink key={s.id} s={s} />)}
                    </div>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
