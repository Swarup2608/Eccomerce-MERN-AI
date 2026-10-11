import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <AccountView />
      </main>
    </div>
  );
}
