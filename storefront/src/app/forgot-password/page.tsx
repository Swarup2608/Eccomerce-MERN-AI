import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">Enter your email and we will send you a reset link.</p>
        </div>
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
