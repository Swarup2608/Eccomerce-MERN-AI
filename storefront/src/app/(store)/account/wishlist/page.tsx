import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { WishlistView } from "@/app/(store)/account/wishlist/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1400px]">
        <SignedIn next="/account/wishlist">
          <AccountShell title="Saved items">
            <WishlistView />
          </AccountShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
