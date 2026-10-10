"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSpinner } from "@/components/AppShell";
import { getMyOnboarding } from "@/lib/api/onboarding";
import { useAuth } from "@/providers/AuthProvider";

// Entry point: sends each seller to the right place for their account state.
export default function HomePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    getMyOnboarding()
      .then((response) => {
        if (cancelled) return;
        router.replace(response.data.vendor.status === "active" ? "/dashboard" : "/onboarding");
      })
      .catch(() => {
        // No vendor record yet (or the lookup failed): the onboarding page handles both.
        if (!cancelled) router.replace("/onboarding");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoading, user, router]);

  return <PageSpinner label="Opening Seller Hub…" />;
}
