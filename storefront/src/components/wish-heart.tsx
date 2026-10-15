"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { shopApi } from "@/lib/shop-api";
import { useHref } from "@/lib/base-path";

// Heart on a product card. Signed-out visitors are sent to sign in; otherwise it toggles the account wishlist.
export function WishHeart({ productId }: { productId: string }) {
  const to = useHref();
  const user = useSession();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    let current = true;
    shopApi.wishlistIds().then(
      (ids) => current && setSaved(ids.includes(productId)),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [user, productId]);

  async function toggle() {
    if (!user) return router.push(to(`/login?next=${to("/account/wishlist")}`));
    const next = !saved;
    setSaved(next);
    try {
      if (next) await shopApi.addToWishlist(productId);
      else await shopApi.removeFromWishlist(productId);
    } catch {
      setSaved(!next);
    }
  }

  return (
    <button type="button" className="btn btn-icon" aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} aria-pressed={saved} onClick={toggle} style={{ position: "absolute", top: 10, right: 10, width: 38, height: 38, background: "var(--color-bg)", color: saved ? "var(--color-accent)" : "var(--color-text)", borderRadius: 999, border: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}
