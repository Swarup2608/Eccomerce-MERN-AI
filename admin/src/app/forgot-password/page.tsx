import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <span className="mb-4 inline-block rounded bg-white px-2 py-1"><Image src="/logo.png" alt="Vektor" width={120} height={40} priority className="h-8 w-auto" /></span>
        <p className="text-xs font-medium uppercase tracking-widest text-black/50 dark:text-white/50">Admin Console</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">Enter your admin email and we will send you a reset link. Resetting also unblocks a blocked account.</p>
      </div>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm underline">
        Back to sign in
      </Link>
    </main>
  );
}
