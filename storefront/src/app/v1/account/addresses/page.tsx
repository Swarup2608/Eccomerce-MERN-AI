import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { AccountShell, SignedIn } from "@/components/signed-in";
import { PageShell } from "@/components/ui";
import { AddressBook } from "@/app/(classic)/account/addresses/address-book";

export const metadata: Metadata = { title: "Addresses", robots: { index: false } };

export default function AddressesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
      <PageShell width="max-w-[1200px]">
        <SignedIn next="/account">
          <AccountShell title="Addresses">
            <AddressBook />
          </AccountShell>
        </SignedIn>
      </PageShell>
    </div>
  );
}
