import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountView } from "@/app/(store)/account/account-view";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pb-24 pt-10 sm:px-8">
        <AccountView />
      </main>
    </div>
  );
}
