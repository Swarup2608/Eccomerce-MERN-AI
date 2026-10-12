import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { WishlistView } from "./wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell>
        <SignedIn next="/account/wishlist">
          <AccountShell title="Wishlist">
            <WishlistView />
          </AccountShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
