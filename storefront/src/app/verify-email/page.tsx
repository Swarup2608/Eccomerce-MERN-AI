import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false, follow: false } };

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
        <Suspense>
          <VerifyEmail />
        </Suspense>
      </main>
    </div>
  );
}
