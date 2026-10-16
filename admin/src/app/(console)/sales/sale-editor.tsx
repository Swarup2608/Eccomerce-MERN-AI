"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { FormError } from "@/components/form-field";
import { Badge, Button, Card, Field, Input, Loading, Notice, PageHeader, Select, StatusPill, TextArea, Thumb } from "@/components/ui";
import { confirmDialog } from "@/components/dialog";
import { adminApi, flattenTree, SALE_SCOPE_LABELS, SALE_STATUS_LABELS, type CategoryNode, type DiscountType, type Product, type Sale, type SaleInput, type SaleScope } from "@/lib/admin-api";
import { errorMessage } from "@/lib/auth";
import { formatInr, paiseToRupees, rupeesToPaise } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

const DAY_MS = 86_400_000;
const MAX_PERCENT = 90;
const SAMPLE_PRICE = 100_000;

type PickedProduct = Sale["products"][number];

// <input type="datetime-local"> works in the browser's local time without a zone; the API takes ISO instants.
const toLocalInput = (value: string | Date): string => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const discounted = (price: number, type: DiscountType, value: number): number => Math.max(price - (type === "percent" ? Math.round((price * value) / 100) : value), Math.min(price, 100));

const toPicked = (product: Product): PickedProduct => ({ id: product.id, title: product.title, slug: product.slug, image: product.images[0] ?? null, minPrice: product.minPrice, maxPrice: product.maxPrice, status: product.status });

export function SaleEditor({ saleId }: { saleId: string | null }) {
  const router = useRouter();
  const loadCategories = useCallback(() => adminApi.categories(), []);
  const { data: categories } = useLoad(loadCategories);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    let current = true;
    adminApi.sale(saleId).then(
      (loaded) => current && setSale(loaded),
      (err: unknown) => current && setLoadError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [saleId]);

  if (saleId && !sale) return loadError ? <FormError message={loadError} /> : <Loading />;
  if (!categories) return <Loading />;

  return (
    <SaleForm
      key={sale?.updatedAt ?? "new"}
      sale={sale}
      tree={categories.tree}
      onSaved={(saved, created) => {
        if (created) router.replace(`/sales/${saved.id}?created=1`);
        else setSale(saved);
      }}
      onDeleted={() => router.replace("/sales")}
    />
  );
}

function SaleForm({ sale, tree, onSaved, onDeleted }: { sale: Sale | null; tree: CategoryNode[]; onSaved: (sale: Sale, created: boolean) => void; onDeleted: () => void }) {
  const [name, setName] = useState(sale?.name ?? "");
  const [slug, setSlug] = useState(sale?.slug ?? "");
  const [description, setDescription] = useState(sale?.description ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>(sale?.discountType ?? "percent");
  const [amount, setAmount] = useState(() => (!sale ? "20" : sale.discountType === "percent" ? String(sale.discountValue) : paiseToRupees(sale.discountValue)));
  const [appliesTo, setAppliesTo] = useState<SaleScope>(sale?.appliesTo ?? "all");
  const [categoryIds, setCategoryIds] = useState<string[]>(sale?.categoryIds ?? []);
  const [picked, setPicked] = useState<PickedProduct[]>(sale?.products ?? []);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(sale?.startsAt ?? new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(sale?.endsAt ?? new Date(Date.now() + 7 * DAY_MS)));
  const [isActive, setActive] = useState(sale?.isActive ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // This form only renders in the browser (after the data loads), so reading the URL here is safe.
  const [notice, setNotice] = useState<string | null>(() => (new URLSearchParams(window.location.search).get("created") ? "Sale created." : null));

  const value = discountType === "percent" ? (/^\d+$/.test(amount.trim()) ? Number(amount) : null) : rupeesToPaise(amount);
  const samplePrice = picked[0]?.minPrice ?? SAMPLE_PRICE;

  function buildInput(): SaleInput | string {
    if (value === null || value < 1) return discountType === "percent" ? "Enter a whole percentage" : "Enter the amount off in rupees";
    if (discountType === "percent" && value > MAX_PERCENT) return `At most ${MAX_PERCENT}% off`;
    if (appliesTo === "categories" && categoryIds.length === 0) return "Pick at least one category";
    if (appliesTo === "products" && picked.length === 0) return "Add at least one product";
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Set when the sale starts and ends";
    if (end <= start) return "The sale must end after it starts";
    return {
      name: name.trim(),
      ...(slug.trim() ? { slug: slug.trim() } : {}),
      description: description.trim(),
      discountType,
      discountValue: value,
      appliesTo,
      categoryIds: appliesTo === "categories" ? categoryIds : [],
      productIds: appliesTo === "products" ? picked.map((product) => product.id) : [],
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      isActive,
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const input = buildInput();
    if (typeof input === "string") return setError(input);
    setPending(true);
    try {
      const saved = sale ? await adminApi.updateSale(sale.id, input) : await adminApi.createSale(input);
      onSaved(saved, !sale);
      if (sale) setNotice("Sale saved. Shop prices update within a minute.");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  async function remove() {
    if (!sale || !(await confirmDialog({ title: `Delete “${sale.name}”?`, message: "Prices go back to normal at once. Orders already placed keep their sale prices.", confirmLabel: "Delete sale", tone: "danger" }))) return;
    try {
      await adminApi.deleteSale(sale.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function endNow() {
    setEndsAt(toLocalInput(new Date()));
    if (new Date(startsAt) >= new Date()) setStartsAt(toLocalInput(new Date(Date.now() - 60_000)));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <PageHeader
        title={sale ? sale.name : "New sale"}
        description={sale ? `${sale.label} · ${sale.appliesTo === "all" ? "whole catalogue" : SALE_SCOPE_LABELS[sale.appliesTo].toLowerCase()}` : "Discount the whole catalogue, some categories or a few products for a set time."}
        actions={sale ? <StatusPill status={sale.status} label={SALE_STATUS_LABELS[sale.status]} /> : null}
      />
      {notice ? <Notice>{notice}</Notice> : null}

      {sale ? (
        <Card title="Performance">
          <div className="grid gap-4 sm:grid-cols-4">
            <Stat label="Orders" value={String(sale.stats.orders)} />
            <Stat label="Units sold" value={String(sale.stats.units)} />
            <Stat label="Revenue" value={formatInr(sale.stats.revenue)} />
            <Stat label="Discount given" value={formatInr(sale.stats.discountGiven)} />
          </div>
          <p className="mt-3 text-xs text-foreground/55">Counts confirmed orders (not awaiting payment or cancelled) whose items were priced by this sale.</p>
        </Card>
      ) : null}

      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Shown to shoppers, e.g. “Diwali Sale”.">
            <Input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Slug · optional" hint="The sale’s web address. Made from the name if empty.">
            <Input maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} />
          </Field>
          <Field label="Tagline · optional" className="sm:col-span-2">
            <TextArea maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-16" />
          </Field>
        </div>
      </Card>

      <Card title="Discount">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Type">
            <Select
              value={discountType}
              onChange={(event) => {
                setDiscountType(event.target.value as DiscountType);
                setAmount("");
              }}
            >
              <option value="percent">Percentage off</option>
              <option value="fixed">Fixed amount off each item</option>
            </Select>
          </Field>
          <Field label={discountType === "percent" ? "Percent off" : "Rupees off"}>
            <Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-32" />
          </Field>
          {value ? (
            <p className="pb-2.5 text-sm text-foreground/70">
              {picked[0] ? `${picked[0].title}: ` : "A "}
              {formatInr(samplePrice)}
              {picked[0] ? "" : " item"} → <b className="text-foreground">{formatInr(discounted(samplePrice, discountType, value))}</b>
            </p>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-foreground/55">If several live sales cover a product, it gets the lowest price. A sale never takes an item below ₹1.</p>
      </Card>

      <Card title="Applies to">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-5" role="radiogroup" aria-label="Applies to">
            {(Object.keys(SALE_SCOPE_LABELS) as SaleScope[]).map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input type="radio" name="appliesTo" checked={appliesTo === scope} onChange={() => setAppliesTo(scope)} /> {SALE_SCOPE_LABELS[scope]}
              </label>
            ))}
          </div>
          {appliesTo === "categories" ? <CategoryPicker tree={tree} selected={categoryIds} onChange={setCategoryIds} /> : null}
          {appliesTo === "products" ? <ProductPicker picked={picked} onChange={setPicked} /> : null}
        </div>
      </Card>

      <Card title="Schedule">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Starts">
            <Input type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="datetime-local" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </Field>
          {sale?.status === "live" ? (
            <Button variant="ghost" onClick={endNow}>
              End now
            </Button>
          ) : null}
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="checkbox" checked={isActive} onChange={(event) => setActive(event.target.checked)} /> Switched on
          </label>
        </div>
        <p className="mt-3 text-xs text-foreground/55">Times are in your browser’s time zone. Switch a sale off to pause it without losing its schedule.</p>
      </Card>

      <FormError message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving..." : sale ? "Save sale" : "Create sale"}
        </Button>
        {sale ? (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.12em] text-foreground/55">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// Picking a parent category includes everything under it, so its children are shown as covered rather than pickable.
function CategoryPicker({ tree, selected, onChange }: { tree: CategoryNode[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const rows = flattenTree(tree);
  const chosen = new Set(selected);
  return (
    <div className="max-h-80 overflow-y-auto border border-divider">
      {rows.length === 0 ? <p className="p-4 text-sm text-foreground/55">No categories yet.</p> : null}
      {rows.map(({ category, depth }) => {
        const covered = category.ancestorIds.some((id) => chosen.has(id));
        return (
          <label key={category.id} className={`flex items-center gap-2 border-b border-divider px-3 py-2 text-sm last:border-b-0 ${covered ? "text-foreground/45" : ""}`} style={{ paddingLeft: 12 + depth * 20 }}>
            <input
              type="checkbox"
              disabled={covered}
              checked={chosen.has(category.id) || covered}
              onChange={(event) => onChange(event.target.checked ? [...selected, category.id] : selected.filter((id) => id !== category.id))}
            />
            {category.name}
            {!category.isActive ? <Badge>Hidden</Badge> : null}
            {covered ? <span className="text-xs">· included via parent</span> : null}
          </label>
        );
      })}
    </div>
  );
}

function ProductPicker({ picked, onChange }: { picked: PickedProduct[]; onChange: (products: PickedProduct[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Product[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedIds = new Set(picked.map((product) => product.id));

  // The picker sits inside the sale form, so it searches on Enter or the button instead of being a form of its own.
  async function search() {
    setSearching(true);
    setError(null);
    try {
      setResults((await adminApi.products({ q: q.trim() || undefined, limit: 12 })).items);
    } catch (err) {
      setError(errorMessage(err));
    }
    setSearching(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void search();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Input type="search" placeholder="Find products by title, brand or SKU" value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={onKeyDown} className="flex-1" aria-label="Find products" />
          <Button onClick={search} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
        <FormError message={error} />
        {results ? (
          <ul className="divide-y divide-divider border border-divider">
            {results.length === 0 ? <li className="p-3 text-sm text-foreground/55">No products match.</li> : null}
            {results.map((product) => (
              <li key={product.id} className="flex items-center gap-3 p-2.5 text-sm">
                <Thumb src={product.images[0]?.url} alt="" size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{product.title}</span>
                  <span className="text-xs text-foreground/55">
                    {formatInr(product.minPrice)} · {product.status}
                  </span>
                </span>
                <Button variant="ghost" disabled={pickedIds.has(product.id)} onClick={() => onChange([...picked, toPicked(product)])}>
                  {pickedIds.has(product.id) ? "Added" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-foreground/55">Search to find products to add.</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground/65">In this sale · {picked.length}</p>
        <ul className="max-h-96 divide-y divide-divider overflow-y-auto border border-divider">
          {picked.length === 0 ? <li className="p-3 text-sm text-foreground/55">Nothing added yet.</li> : null}
          {picked.map((product) => (
            <li key={product.id} className="flex items-center gap-3 p-2.5 text-sm">
              <Thumb src={product.image?.url} alt="" size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{product.title}</span>
                <span className="text-xs text-foreground/55">
                  {formatInr(product.minPrice)}
                  {product.status !== "active" ? ` · ${product.status}` : ""}
                </span>
              </span>
              <Button variant="ghost" onClick={() => onChange(picked.filter((entry) => entry.id !== product.id))} aria-label={`Remove ${product.title}`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
