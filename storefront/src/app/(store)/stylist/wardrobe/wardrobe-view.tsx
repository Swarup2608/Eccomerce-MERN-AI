"use client";

import { useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/dialog";
import { FormError } from "@/components/form-field";
import { Thumb } from "@/components/stylist-bits";
import { Button, EmptyState, Field, Input, Loading, Select } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { CATEGORIES, shrinkImage, stylistApi, WARDROBE_OCCASIONS, type WardrobeInput, type WardrobeItem } from "@/lib/stylist";

const BLANK: Omit<WardrobeInput, "image"> = { name: "", category: "dress", color: "", material: "", fit: "", length: "", occasions: [], description: "" };

export function WardrobeView() {
  const [items, setItems] = useState<WardrobeItem[] | null>(null);
  const [form, setForm] = useState(BLANK);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    stylistApi.wardrobe().then((loaded) => current && setItems(loaded), (err: unknown) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, []);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setImage(await shrinkImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessage(err));
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!image) return setError("Add a photo of the piece first.");
    setBusy(true);
    setError(null);
    try {
      const item = await stylistApi.addItem({ ...form, image });
      setItems((current) => [item, ...(current ?? [])]);
      setForm(BLANK);
      setImage(null);
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function remove(item: WardrobeItem) {
    if (!(await confirmDialog({ title: "Remove from wardrobe?", message: item.name, confirmLabel: "Remove" }))) return;
    try {
      await stylistApi.removeItem(item.id);
      setItems((current) => (current ?? []).filter((x) => x.id !== item.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleOccasion = (o: string) => set("occasions", form.occasions.includes(o) ? form.occasions.filter((x) => x !== o) : [...form.occasions, o]);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,420px)_1fr]">
      <form onSubmit={save} className="flex flex-col gap-4 self-start" aria-label="Add to wardrobe">
        <h2 className="m-0 text-2xl">Add a piece</h2>
        <div className="flex flex-col gap-3">
          <div className="max-w-[260px]">
            <Thumb src={image} label={image ? "Photo preview" : "No photo yet"} />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={() => camera.current?.click()}>Take a photo</Button>
            <Button onClick={() => upload.current?.click()}>Upload a photo</Button>
          </div>
          {/* `capture` opens the camera on phones; on a computer it falls back to the file picker. */}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={upload} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <Field label="Name"><Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={80} placeholder="e.g. Blue floral midi dress" required /></Field>
        <Field label="Type">
          <Select value={form.category} onChange={(e) => set("category", e.target.value as WardrobeInput["category"])}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Colour"><Input value={form.color} onChange={(e) => set("color", e.target.value)} maxLength={30} placeholder="Navy" /></Field>
          <Field label="Material"><Input value={form.material} onChange={(e) => set("material", e.target.value)} maxLength={30} placeholder="Cotton" /></Field>
          <Field label="Fit"><Input value={form.fit} onChange={(e) => set("fit", e.target.value)} maxLength={30} placeholder="Relaxed" /></Field>
          <Field label="Length"><Input value={form.length} onChange={(e) => set("length", e.target.value)} maxLength={30} placeholder="Midi" /></Field>
        </div>
        <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium">Good for</legend>
          {WARDROBE_OCCASIONS.map((o) => (
            <label key={o} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={form.occasions.includes(o)} onChange={() => toggleOccasion(o)} />
              {o}
            </label>
          ))}
        </fieldset>
        <Field label="Description" hint="Anything the stylist should know: fabric feel, where you wear it, what it goes with.">
          <textarea className="input min-h-24 py-2" value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} />
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving..." : "Add to wardrobe"}</Button>
      </form>

      <section aria-label="Your wardrobe">
        <h2 className="m-0 mb-5 text-2xl">Your pieces{items ? <span className="ml-3 text-base font-normal opacity-50">{items.length}</span> : null}</h2>
        {items === null ? (
          error ? null : <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="Nothing here yet" text="Add a few pieces and the stylist can build outfits from what you already own." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-4 gap-y-8">
            {items.map((item) => (
              <article key={item.id} className="flex min-w-0 flex-col gap-2">
                <Thumb src={item.image} label={item.name} />
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold">{item.name}</p>
                  <p className="m-0 truncate text-xs text-foreground/60">{[CATEGORIES.find((c) => c.value === item.category)?.label, item.color, item.material].filter(Boolean).join(" · ")}</p>
                  {item.occasions.length ? <p className="m-0 truncate text-xs text-foreground/60">{item.occasions.join(", ")}</p> : null}
                </div>
                <Button variant="ghost" className="self-start !px-0" onClick={() => void remove(item)}>Remove</Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
