import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { WishlistView } from "@/app/(classic)/account/wishlist/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default function WishlistPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
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
