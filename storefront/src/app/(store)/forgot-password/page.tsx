import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/app/(store)/forgot-password/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell step="Account recovery" title="Forgot your password?">
      <p className="-mt-3 text-sm text-foreground/60">Enter your email and we’ll send you a reset link.</p>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
