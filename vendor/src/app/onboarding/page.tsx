"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiCheck, FiClock, FiSlash } from "react-icons/fi";
import AppShell, { PageSpinner } from "@/components/AppShell";
import AddressesStep from "@/components/onboarding/AddressesStep";
import BankStep from "@/components/onboarding/BankStep";
import BusinessStep from "@/components/onboarding/BusinessStep";
import DocumentsStep from "@/components/onboarding/DocumentsStep";
import ReviewStep from "@/components/onboarding/ReviewStep";
import StoreStep from "@/components/onboarding/StoreStep";
import { Field } from "@/components/onboarding/shared";
import { ApiError, errorMessage } from "@/lib/api/client";
import { BUSINESS_TYPE_LABELS, getMyOnboarding, startOnboarding, type BusinessType, type Checklist, type Onboarding, type OnboardingStep } from "@/lib/api/onboarding";

const STEPS: { id: OnboardingStep; label: string; done: (checklist: Checklist) => boolean }[] = [
  { id: "business_details", label: "Business details", done: (c) => c.businessDetails },
  { id: "documents", label: "Documents", done: (c) => c.documents },
  { id: "bank_details", label: "Bank account", done: (c) => c.bankAccount },
  { id: "addresses", label: "Addresses", done: (c) => c.businessAddress },
  { id: "store_setup", label: "Store profile", done: (c) => c.store },
  { id: "review", label: "Review & submit", done: () => false },
];

type LoadResult = { kind: "loaded"; data: Onboarding } | { kind: "not_started" } | { kind: "error"; message: string };

// Fetches without touching state, so the effect only sets state in its callback.
async function fetchOnboarding(): Promise<LoadResult> {
  try {
    const response = await getMyOnboarding();
    return { kind: "loaded", data: response.data };
  } catch (error) {
    if (error instanceof ApiError && error.code === "VENDOR_NOT_FOUND") {
      return { kind: "not_started" };
    }
    return { kind: "error", message: errorMessage(error, "Unable to load your application.") };
  }
}

export default function OnboardingPage() {
  return (
    <AppShell>
      <OnboardingWizard />
    </AppShell>
  );
}

function OnboardingWizard() {
  const [data, setData] = useState<Onboarding | null>(null);
  const [notStarted, setNotStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<OnboardingStep>("business_details");

  const apply = useCallback((result: LoadResult) => {
    setLoading(false);
    if (result.kind === "loaded") {
      setData(result.data);
      setNotStarted(false);
      setLoadError(null);
      if (result.data.application) {
        setActiveStep(result.data.application.currentStep);
      }
    } else if (result.kind === "not_started") {
      setNotStarted(true);
    } else {
      setLoadError(result.message);
    }
  }, []);

  const load = useCallback(async () => apply(await fetchOnboarding()), [apply]);

  useEffect(() => {
    let cancelled = false;

    void fetchOnboarding().then((result) => {
      if (!cancelled) apply(result);
    });

    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (loading) {
    return <PageSpinner label="Loading your application…" />;
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-3xl border border-red-100 bg-surface p-8 text-center">
        <p className="font-bold">{loadError}</p>
        <button type="button" className="btn-primary mt-4" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }

  if (notStarted || !data) {
    return <StartApplication onStarted={load} />;
  }

  const status = data.application?.status ?? "in_progress";
  const editable = (status === "in_progress" || status === "rejected") && data.vendor.status !== "suspended";
  const stepProps = { data, editable, onSaved: load };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">Seller application</p>
        <h1 className="mt-1 text-3xl font-black">{data.vendor.businessName}</h1>
      </div>

      <StatusBanner data={data} />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Application steps">
          {STEPS.map((step, index) => {
            const done = step.done(data.checklist);
            const active = step.id === activeStep;
            return (
              <li key={step.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => setActiveStep(step.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${active ? "bg-primary text-white shadow-sm" : "bg-surface hover:bg-indigo-50"}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-white/20" : done ? "bg-green-100 text-success" : "bg-slate-100 text-muted"}`}>
                    {done ? <FiCheck size={14} /> : index + 1}
                  </span>
                  {step.label}
                </button>
              </li>
            );
          })}
        </ol>

        <div>
          {activeStep === "business_details" && <BusinessStep key={data.vendor.businessName} {...stepProps} />}
          {activeStep === "documents" && <DocumentsStep {...stepProps} />}
          {activeStep === "bank_details" && <BankStep key={data.bankAccount?._id ?? "new"} {...stepProps} />}
          {activeStep === "addresses" && <AddressesStep {...stepProps} />}
          {activeStep === "store_setup" && <StoreStep key={data.store?._id ?? "new"} {...stepProps} />}
          {activeStep === "review" && <ReviewStep {...stepProps} />}
        </div>
      </div>
    </div>
  );
}

function StatusBanner({ data }: { data: Onboarding }) {
  const status = data.application?.status;

  if (data.vendor.status === "suspended") {
    return (
      <Banner tone="danger" icon={<FiSlash size={20} />} title="Your seller account is suspended">
        {data.vendor.suspensionReason ?? "Contact seller support for details."}
      </Banner>
    );
  }
  if (status === "submitted") {
    return (
      <Banner tone="info" icon={<FiClock size={20} />} title="Application under review">
        Submitted {data.application?.submittedAt ? new Date(data.application.submittedAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : ""}. We&apos;ll email you once it&apos;s reviewed.
      </Banner>
    );
  }
  if (status === "rejected") {
    return (
      <Banner tone="danger" icon={<FiAlertTriangle size={20} />} title="Changes needed">
        {data.application?.rejectionReason ?? "Please review your details."} Update the highlighted items and resubmit.
      </Banner>
    );
  }
  if (status === "approved") {
    return (
      <Banner tone="success" icon={<FiCheck size={20} />} title="You're approved to sell">
        <Link href="/dashboard" className="font-bold underline">
          Open your seller dashboard
        </Link>
      </Banner>
    );
  }
  return null;
}

const BANNER_TONES = {
  info: "border-indigo-100 bg-indigo-50 text-indigo-900",
  success: "border-green-100 bg-green-50 text-green-900",
  danger: "border-red-100 bg-red-50 text-red-900",
};

function Banner({ tone, icon, title, children }: { tone: keyof typeof BANNER_TONES; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div role="status" className={`flex gap-3 rounded-2xl border px-5 py-4 ${BANNER_TONES[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-sm">
        <p className="font-bold">{title}</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function StartApplication({ onStarted }: { onStarted: () => Promise<void> }) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("individual");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await startOnboarding({ businessName: businessName.trim(), businessType });
      toast.success("Application started");
      await onStarted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-surface p-8 shadow-sm">
      <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">Become a seller</p>
      <h1 className="mt-2 text-3xl font-black">Start selling on ShopSphere</h1>
      <p className="mt-3 text-sm leading-6 text-muted">The application takes about ten minutes. Keep a government ID, your bank details and your business address handy. You can save and come back any time.</p>

      <form className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Registered business name">
          <input className="field" value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength={150} required />
        </Field>
        <Field label="Business type">
          <select className="field" value={businessType} onChange={(event) => setBusinessType(event.target.value as BusinessType)}>
            {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={saving || businessName.trim().length < 2}>
            {saving ? "Starting…" : "Start application"}
          </button>
        </div>
      </form>
    </div>
  );
}
