"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import type { ProductImage } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/auth";
import { shopApi, type Cart, type CartLine } from "@/lib/shop-api";

// One cart for the whole page, shared by the header badge, product pages and the cart page.
// Signed in: the API cart (prices and stock always live). Signed out: a guest cart in localStorage that keeps a snapshot
// for display only; it is merged into the account cart right after sign-in, where everything is re-checked.

const GUEST_KEY = "guest-cart-v1";
const MAX_LINE_QUANTITY = 10;

export interface GuestLine {
  productId: string;
  sku: string;
  quantity: number;
  // Display snapshot taken when the item was added; the server re-prices on merge.
  slug: string;
  title: string;
  brand: string;
  image: ProductImage | null;
  options: Record<string, string>;
  unitPrice: number;
}

export interface CartState {
  cart: Cart;
  // Whether `cart` is the account cart (true) or the guest cart (false). Undefined until known.
  signedIn: boolean | undefined;
}

const EMPTY: Cart = { lines: [], itemCount: 0, subtotal: 0, hasIssues: false };

let state: CartState = { cart: EMPTY, signedIn: undefined };
let loading: Promise<void> | null = null;
const listeners = new Set<(state: CartState) => void>();

function publish(next: CartState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

function readGuest(): GuestLine[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as GuestLine[]).filter((line) => typeof line?.sku === "string" && typeof line.productId === "string").slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeGuest(lines: GuestLine[]): void {
  try {
    if (lines.length) window.localStorage.setItem(GUEST_KEY, JSON.stringify(lines));
    else window.localStorage.removeItem(GUEST_KEY);
  } catch {
    // Storage can be unavailable (private mode); the cart then lasts for this page only.
  }
}

const guestCart = (lines: GuestLine[]): Cart => ({
  lines: lines.map<CartLine>((line) => ({ ...line, compareAtPrice: null, sale: null, lineTotal: line.unitPrice * line.quantity, available: MAX_LINE_QUANTITY, status: "ok" })),
  itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  subtotal: lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
  hasIssues: false,
});

function load(): Promise<void> {
  loading ??= getCurrentUser()
    .then(async (user) => {
      if (!user) return publish({ cart: guestCart(readGuest()), signedIn: false });
      publish({ cart: await shopApi.cart(), signedIn: true });
    })
    .catch(() => publish({ cart: guestCart(readGuest()), signedIn: false }));
  return loading;
}

export function useCart(): CartState {
  const [current, setCurrent] = useState<CartState>(state);
  useEffect(() => {
    listeners.add(setCurrent);
    void load().then(() => setCurrent(state));
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  return current;
}

export async function refreshCart(): Promise<void> {
  loading = null;
  await load();
}

export async function addToCart(line: GuestLine): Promise<void> {
  await load();
  if (state.signedIn) {
    publish({ cart: await shopApi.addToCart(line.productId, line.sku, line.quantity), signedIn: true });
    return;
  }
  const lines = readGuest();
  const existing = lines.find((item) => item.sku === line.sku);
  if (existing) existing.quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity);
  else lines.push(line);
  writeGuest(lines);
  publish({ cart: guestCart(lines), signedIn: false });
}

export async function setLineQuantity(sku: string, quantity: number): Promise<void> {
  if (state.signedIn) {
    publish({ cart: quantity === 0 ? await shopApi.removeFromCart(sku) : await shopApi.setQuantity(sku, quantity), signedIn: true });
    return;
  }
  const lines = readGuest()
    .map((line) => (line.sku === sku ? { ...line, quantity } : line))
    .filter((line) => line.quantity > 0);
  writeGuest(lines);
  publish({ cart: guestCart(lines), signedIn: false });
}

// Called right after sign-in: the guest cart moves into the account (the server drops what can no longer be bought).
export async function mergeGuestCart(): Promise<void> {
  const lines = readGuest();
  try {
    const cart = lines.length ? await shopApi.mergeCart(lines.map(({ productId, sku, quantity }) => ({ productId, sku, quantity }))) : await shopApi.cart();
    writeGuest([]);
    loading = Promise.resolve();
    publish({ cart, signedIn: true });
  } catch (error) {
    // Keep the guest cart if the merge failed for a temporary reason; it is retried on the next sign-in.
    if (!(error instanceof ApiError) || error.status >= 500) return;
    writeGuest([]);
  }
}

// After sign-out the header should show an empty guest cart again.
export function resetCart(): void {
  loading = null;
  publish({ cart: guestCart(readGuest()), signedIn: false });
}
