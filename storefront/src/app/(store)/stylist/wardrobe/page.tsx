import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { StylistShell } from "@/components/stylist-bits";
import { WardrobeView } from "@/app/(store)/stylist/wardrobe/wardrobe-view";

export const metadata: Metadata = { title: "My wardrobe", robots: { index: false } };

export default function WardrobePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1400px]">
        <SignedIn next="/stylist/wardrobe">
          <StylistShell title="Stylist">
            <WardrobeView />
          </StylistShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
