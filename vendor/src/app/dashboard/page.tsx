"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell, { PageSpinner } from "@/components/AppShell";
import { errorMessage } from "@/lib/api/client";
import { getMyOnboarding, type Onboarding } from "@/lib/api/onboarding";

// Approved sellers land here. Listings, orders and payouts arrive in the next phase.
export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardHome />
    </AppShell>
  );
}

function DashboardHome() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyOnboarding()
      .then((response) => setData(response.data))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, []);

  if (error) {
    return <p className="text-sm text-danger">{error}</p>;
  }
  if (!data) {
    return <PageSpinner label="Loading your store…" />;
  }

  if (data.vendor.status !== "active") {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8">
        <h1 className="text-2xl font-black">Your store isn&apos;t active yet</h1>
        <p className="mt-2 text-sm text-muted">Finish or check the status of your application to start selling.</p>
        <Link href="/onboarding" className="btn-primary mt-6">
          View application
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-8">
      <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">Welcome</p>
      <h1 className="mt-1 text-3xl font-black">{data.store?.name ?? data.vendor.businessName}</h1>
      <p className="mt-2 text-sm text-muted">Your store is approved and published. Listings, orders and payouts will appear here.</p>
    </div>
  );
}
