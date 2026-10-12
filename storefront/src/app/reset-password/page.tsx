import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </main>
    </div>
  );
}
