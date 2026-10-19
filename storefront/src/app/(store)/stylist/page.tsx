import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { StylistShell } from "@/components/stylist-bits";
import { StylistView } from "@/app/(store)/stylist/stylist-view";

export const metadata: Metadata = { title: "Stylist", robots: { index: false } };

export default function StylistPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <PageShell width="max-w-[1400px]">
        <SignedIn next="/stylist">
          <StylistShell title="Stylist">
            <StylistView />
          </StylistShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
