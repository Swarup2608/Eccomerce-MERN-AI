"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormError } from "@/components/form-field";
import { ProductCard } from "@/components/product-card";
import { confirmDialog, promptDialog } from "@/components/dialog";
import { EmptyState, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { shopApi, type WishlistEntry, type WishlistGroup } from "@/lib/shop-api";

// "all" shows every saved product; otherwise a list id, or "" for the default "Saved items" list.
type Tab = "all" | string;

const MAX_LIST_NAME = 40;
const validName = (text: string) => (!text.trim() ? "Enter a name" : text.trim().length > MAX_LIST_NAME ? `At most ${MAX_LIST_NAME} characters` : null);

export function WishlistView() {
  const [items, setItems] = useState<WishlistEntry[] | null>(null);
  const [lists, setLists] = useState<WishlistGroup[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    shopApi.wishlist().then(
      (loaded) => {
        if (!current) return;
        setItems(loaded.items);
        setLists(loaded.lists);
      },
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, []);

  // Runs a change against the API, showing its error instead of throwing.
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  const remove = (productId: string) =>
    run(async () => {
      await shopApi.removeFromWishlist(productId);
      setItems((current) => current?.filter((item) => item.product.id !== productId) ?? null);
    });

  const move = (productId: string, listId: string | null) =>
    run(async () => {
      await shopApi.addToWishlist(productId, listId);
      setItems((current) => current?.map((item) => (item.product.id === productId ? { ...item, listId } : item)) ?? null);
    });

  async function createList() {
    const name = await promptDialog({ title: "New list", label: "List name", placeholder: "e.g. Birthday ideas", confirmLabel: "Create list", validate: validName });
    if (!name) return;
    await run(async () => {
      const list = await shopApi.createWishlistList(name.trim());
      setLists((current) => [...current, list]);
      setTab(list.id ?? "all");
    });
  }

  async function renameList(list: WishlistGroup) {
    if (!list.id) return;
    const name = await promptDialog({ title: `Rename “${list.name}”`, label: "List name", defaultValue: list.name, confirmLabel: "Rename", validate: validName });
    if (!name || name.trim() === list.name) return;
    await run(async () => {
      const renamed = await shopApi.renameWishlistList(list.id as string, name.trim());
      setLists((current) => current.map((entry) => (entry.id === renamed.id ? renamed : entry)));
    });
  }

  async function deleteList(list: WishlistGroup, count: number) {
    if (!list.id) return;
    const ok = await confirmDialog({ title: `Delete “${list.name}”?`, message: count ? `Its ${count} saved ${count === 1 ? "product moves" : "products move"} back to Saved items.` : undefined, confirmLabel: "Delete list", tone: "danger" });
    if (!ok) return;
    await run(async () => {
      await shopApi.deleteWishlistList(list.id as string, false);
      setLists((current) => current.filter((entry) => entry.id !== list.id));
      setItems((current) => current?.map((item) => (item.listId === list.id ? { ...item, listId: null } : item)) ?? null);
      setTab("all");
    });
  }

  if (!items) return error ? <FormError message={error} /> : <Loading />;

  const countOf = (listId: string | null) => items.filter((item) => item.listId === listId).length;
  const active = tab === "all" ? null : (lists.find((list) => (list.id ?? "") === tab) ?? null);
  const shown = tab === "all" ? items : items.filter((item) => (item.listId ?? "") === tab);
  const chip = (selected: boolean) => `inline-flex min-h-10 items-center gap-2 border px-4 text-sm transition ${selected ? "border-foreground bg-foreground text-background" : "border-divider hover:border-foreground/60"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Wishlists">
        <button type="button" role="tab" aria-selected={tab === "all"} className={chip(tab === "all")} onClick={() => setTab("all")}>
          All <span className="opacity-60">{items.length}</span>
        </button>
        {lists.map((list) => {
          const key = list.id ?? "";
          return (
            <button key={key || "default"} type="button" role="tab" aria-selected={tab === key} className={chip(tab === key)} onClick={() => setTab(key)}>
              {list.name} <span className="opacity-60">{countOf(list.id)}</span>
            </button>
          );
        })}
        <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={createList}>
          + New list
        </button>
      </div>

      {active?.id ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => renameList(active)}>
            Rename list
          </button>
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => deleteList(active, countOf(active.id))}>
            Delete list
          </button>
        </div>
      ) : null}

      <FormError message={error} />

      {shown.length === 0 ? (
        <EmptyState title={items.length ? "This list is empty." : "Nothing saved yet."} text={items.length ? "Move products here with “Move to” under any saved item, or save from a product page." : "Tap the heart on any product to keep it here for later. You can sort saved products into lists."}>
          <Link href={"/products"} className="btn btn-primary">
            Browse products
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-x-5 gap-y-10 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
          {shown.map((item) => (
            <div key={item.product.id} className="flex flex-col gap-3">
              {item.available ? (
                <ProductCard product={item.product} />
              ) : (
                <div className="flex flex-col gap-3.5 opacity-55">
                  <div className="flex aspect-[4/5] items-center justify-center bg-surface text-xs uppercase tracking-[0.12em]">No longer available</div>
                  <span className="font-heading text-[19px]">{item.product.title}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="opacity-65">Move to</span>
                  <select className="input min-h-9 w-auto py-1 text-[13px]" value={item.listId ?? ""} disabled={busy} onChange={(event) => move(item.product.id, event.target.value || null)} aria-label={`Move ${item.product.title} to list`}>
                    {lists.map((list) => (
                      <option key={list.id ?? "default"} value={list.id ?? ""}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => remove(item.product.id)} disabled={busy} className="btn btn-ghost text-sm">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
