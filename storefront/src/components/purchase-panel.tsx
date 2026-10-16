"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FormError } from "@/components/form-field";
import { errorMessage } from "@/lib/auth";
import { addToCart } from "@/lib/cart";
import type { ProductDetail } from "@/lib/catalog";
import { formatDateTime, formatInr } from "@/lib/money";
import { useSession } from "@/lib/session";
import { shopApi, type WishlistGroup } from "@/lib/shop-api";
import { promptDialog } from "@/components/dialog";

const divider = "1px solid var(--color-divider)";
const stepBtn = { width: 48, height: 52, background: "none", border: 0, fontSize: 20, cursor: "pointer", color: "var(--color-text)" } as const;

export function PurchasePanel({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const axes = product.attributeDefs.filter((def) => def.variantAxis);
  // Preselect the first in-stock variant so the price shown is a real one.
  const initial = product.variants.find((variant) => variant.inStock) ?? product.variants[0];
  const [choice, setChoice] = useState<Record<string, string>>(initial?.options ?? {});
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const wish = useWish(product.id);

  const variant = useMemo(() => product.variants.find((candidate) => axes.every((axis) => candidate.options[axis.key] === choice[axis.key])), [product.variants, axes, choice]);

  // Whether picking `value` for `axisKey` (keeping the other choices) leads to a variant that is in stock.
  const reachable = (axisKey: string, value: string) => product.variants.some((candidate) => candidate.inStock && candidate.options[axisKey] === value && axes.every((axis) => axis.key === axisKey || candidate.options[axis.key] === choice[axis.key]));

  function pick(axisKey: string, value: string) {
    const next = { ...choice, [axisKey]: value };
    // If that combination does not exist, jump to the closest variant that has the new value.
    if (!product.variants.some((candidate) => axes.every((axis) => candidate.options[axis.key] === next[axis.key]))) {
      const fallback = product.variants.find((candidate) => candidate.options[axisKey] === value && candidate.inStock) ?? product.variants.find((candidate) => candidate.options[axisKey] === value);
      if (fallback) return setChoice(fallback.options);
    }
    setChoice(next);
    setQuantity(1);
    setAdded(false);
  }

  async function add(thenCheckout = false) {
    if (!variant) return;
    setPending(true);
    setError(null);
    try {
      await addToCart({ productId: product.id, sku: variant.sku, quantity, slug: product.slug, title: product.title, brand: product.brand, image: product.images[0] ?? null, options: variant.options, unitPrice: variant.price });
      setAdded(true);
      if (thenCheckout) router.push("/checkout");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  const maxQuantity = variant ? Math.max(1, Math.min(10, variant.available)) : 1;
  const price = variant?.price ?? product.minPrice;
  const was = variant?.compareAtPrice ?? product.compareAtPrice;
  const save = was && was > price ? was - price : 0;
  const inStock = Boolean(variant?.inStock);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 40, fontVariantNumeric: "tabular-nums" }}>{formatInr(price)}</span>
        {save ? (
          <>
            <span style={{ fontSize: 18, textDecoration: "line-through", opacity: 0.5 }}>{formatInr(was ?? 0)}</span>
            <span className="tag tag-accent">Save {formatInr(save)}</span>
          </>
        ) : null}
      </div>
      {product.sale ? (
        <Link href={`/products?sale=${product.sale.slug}`} style={{ marginTop: -12, fontSize: 14, textDecoration: "none", color: "var(--color-accent-700)" }}>
          <b>{product.sale.name}</b> · {product.sale.label} · ends {formatDateTime(product.sale.endsAt)} →
        </Link>
      ) : null}

      {axes.map((axis) => (
        <div key={axis.key} style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20, borderTop: divider }}>
          <div style={{ fontSize: 14 }}>
            {axis.label} — <b>{choice[axis.key] ?? "Choose"}</b>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {axis.options
              .filter((option) => product.variants.some((candidate) => candidate.options[axis.key] === option))
              .map((option) => {
                const selected = choice[axis.key] === option;
                const available = reachable(axis.key, option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(axis.key, option)}
                    style={{ minWidth: 48, minHeight: 44, padding: "0 16px", font: "inherit", fontSize: 14, cursor: "pointer", border: `1px solid ${selected ? "var(--color-text)" : "var(--color-divider)"}`, boxShadow: selected ? "inset 0 0 0 1px var(--color-text)" : "none", background: "transparent", color: "var(--color-text)", opacity: available ? 1 : 0.4, textDecoration: available ? "none" : "line-through", borderRadius: "var(--pill,0px)" }}
                  >
                    {option}
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {variant && !inStock ? (
        <div role="status" style={{ fontSize: 13, color: "var(--color-accent-700)" }}>
          This option is sold out.
        </div>
      ) : null}
      {variant && inStock && variant.available <= 5 ? <div style={{ fontSize: 12, color: "var(--color-accent-700)" }}>Only {variant.available} left</div> : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", border: divider }}>
          <button type="button" aria-label="Decrease" onClick={() => setQuantity((q) => Math.max(1, q - 1))} style={stepBtn}>
            −
          </button>
          <span style={{ minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{quantity}</span>
          <button type="button" aria-label="Increase" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} style={stepBtn}>
            +
          </button>
        </div>
        <button type="button" className="btn btn-primary" disabled={pending || !inStock} onClick={() => add()} style={{ flex: "1 1 200px", minHeight: 52, justifyContent: "space-between", fontSize: 16 }}>
          <span>{pending ? "Adding…" : inStock ? "Add to bag" : "Sold out"}</span>
          <span>{formatInr(price * quantity)}</span>
        </button>
        <WishlistButton productId={product.id} wish={wish} />
      </div>
      <SavedInList productId={product.id} wish={wish} onError={setError} />
      <button type="button" className="btn btn-secondary" disabled={pending || !inStock} onClick={() => add(true)} style={{ minHeight: 48, justifyContent: "space-between" }}>
        <span>Buy now — skip the bag</span>
        <span>→</span>
      </button>
      {added ? (
        <div role="status" style={{ fontSize: 14, borderLeft: "2px solid var(--color-accent)", paddingLeft: 10 }}>
          Added to your bag.{" "}
          <Link href={"/cart"} style={{ fontWeight: 600 }}>
            View bag
          </Link>
        </div>
      ) : null}
      <FormError message={error} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", border: divider }}>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flex: "none", marginTop: 2 }}>
            <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
          <span style={{ fontSize: 13 }}>
            <b>Ships in 1–2 days</b>
            <br />
            <span style={{ opacity: 0.65 }}>Free over ₹499</span>
          </span>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", borderLeft: divider }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flex: "none", marginTop: 2 }}>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span style={{ fontSize: 13 }}>
            <b>7-day returns</b>
            <br />
            <span style={{ opacity: 0.65 }}>{variant ? (inStock ? (variant.available <= 5 ? `Only ${variant.available} in stock` : "In stock") : "Out of stock") : "Choose an option"}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface WishState {
  saved: boolean;
  // Which of the customer's lists holds the product (null = Saved items).
  listId: string | null;
  lists: WishlistGroup[];
}

const NEW_LIST = "__new";

// Whether the product is saved and in which list. Loads the customer's wishlist once (it is capped at 200 items).
function useWish(productId: string) {
  const user = useSession();
  const [wish, setWish] = useState<WishState | null>(null);

  useEffect(() => {
    if (!user) return;
    let current = true;
    shopApi.wishlist().then(
      ({ items, lists }) => {
        if (!current) return;
        const item = items.find((entry) => entry.product.id === productId);
        setWish({ saved: Boolean(item), listId: item?.listId ?? null, lists });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [user, productId]);

  return { user, wish, setWish };
}

type Wish = ReturnType<typeof useWish>;

function WishlistButton({ productId, wish: { user, wish, setWish } }: { productId: string; wish: Wish }) {
  const [pending, setPending] = useState(false);

  if (user === null) {
    return (
      <Link href={`/login?next=/account/wishlist`} className="btn btn-secondary" title="Sign in to save items" style={{ minHeight: 52, minWidth: 96 }}>
        Save
      </Link>
    );
  }

  async function toggle() {
    if (!wish) return;
    setPending(true);
    try {
      if (wish.saved) await shopApi.removeFromWishlist(productId);
      else await shopApi.addToWishlist(productId);
      setWish({ ...wish, saved: !wish.saved, listId: null });
    } catch {
      // Leave the button as it was; the next page load shows the real state.
    }
    setPending(false);
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={toggle} disabled={pending || !wish} aria-pressed={wish?.saved ?? false} style={{ minHeight: 52, minWidth: 96 }}>
      {wish?.saved ? "Saved ♥" : "Save"}
    </button>
  );
}

// Once saved, the product can be filed into one of the customer's named lists (or a new one).
function SavedInList({ productId, wish: { wish, setWish }, onError }: { productId: string; wish: Wish; onError: (message: string | null) => void }) {
  const [pending, setPending] = useState(false);
  if (!wish?.saved) return null;

  async function move(value: string) {
    if (!wish) return;
    onError(null);
    let listId: string | null = value || null;
    let lists = wish.lists;
    if (value === NEW_LIST) {
      const name = await promptDialog({ title: "New list", label: "List name", placeholder: "e.g. Birthday ideas", confirmLabel: "Create list", validate: (text) => (text.trim() ? null : "Enter a name") });
      if (!name) return;
      setPending(true);
      try {
        const created = await shopApi.createWishlistList(name.trim());
        lists = [...lists, created];
        listId = created.id;
      } catch (err) {
        setPending(false);
        return onError(errorMessage(err));
      }
    }
    setPending(true);
    try {
      await shopApi.addToWishlist(productId, listId);
      setWish({ ...wish, lists, listId });
    } catch (err) {
      onError(errorMessage(err));
    }
    setPending(false);
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, flexWrap: "wrap" }}>
      Saved in
      <select className="input" value={wish.listId ?? ""} disabled={pending} onChange={(event) => move(event.target.value)} style={{ width: "auto", minHeight: 40 }}>
        {wish.lists.map((list) => (
          <option key={list.id ?? "default"} value={list.id ?? ""}>
            {list.name}
          </option>
        ))}
        <option value={NEW_LIST}>+ New list…</option>
      </select>
      <Link href={"/account/wishlist"} style={{ fontSize: 13 }}>
        View lists
      </Link>
    </label>
  );
}
