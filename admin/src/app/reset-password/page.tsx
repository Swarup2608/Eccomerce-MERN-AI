import Image from "next/image";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <span className="mb-4 inline-block rounded bg-white px-2 py-1"><Image src="/logo.png" alt="Vektor" width={120} height={40} priority className="h-8 w-auto" /></span>
        <p className="text-xs font-medium uppercase tracking-widest text-black/50 dark:text-white/50">Admin Console</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Choose a new password</h1>
      </div>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
