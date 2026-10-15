import type { Metadata } from "next";
import { SiteHeaderV1 } from "@/components/v1/site-header";
import { AccountView } from "@/app/(classic)/account/account-view";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeaderV1 />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-24 pt-10 sm:px-8">
        <AccountView />
      </main>
    </div>
  );
}
