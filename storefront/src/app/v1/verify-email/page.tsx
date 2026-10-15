import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth-shell";
import { VerifyEmail } from "@/app/(classic)/verify-email/verify-email";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false, follow: false } };

export default function VerifyEmailPage() {
  return (
    <AuthShell step="Almost done" title="Verify your email">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthShell>
  );
}
