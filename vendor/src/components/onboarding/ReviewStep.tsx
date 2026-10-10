"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheckCircle, FiCircle } from "react-icons/fi";
import { errorMessage } from "@/lib/api/client";
import { submitOnboarding, type Checklist } from "@/lib/api/onboarding";
import { StepCard, type StepProps } from "./shared";

const CHECKLIST_LABELS: Record<keyof Checklist, string> = {
  businessDetails: "Business details",
  documents: "At least one verification document",
  bankAccount: "Payout bank account",
  businessAddress: "Business address",
  store: "Store profile",
};

export default function ReviewStep({ data, editable, onSaved }: StepProps) {
  const [submitting, setSubmitting] = useState(false);
  const complete = Object.values(data.checklist).every(Boolean);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitOnboarding();
      toast.success("Application submitted for review");
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StepCard title="Review and submit" description="Our team usually reviews applications within two business days. We'll email you when there's a decision.">
      <ul className="space-y-3">
        {(Object.keys(CHECKLIST_LABELS) as (keyof Checklist)[]).map((key) => (
          <li key={key} className="flex items-center gap-3 text-sm">
            {data.checklist[key] ? <FiCheckCircle className="text-success" size={20} /> : <FiCircle className="text-slate-300" size={20} />}
            <span className={data.checklist[key] ? "font-semibold" : "text-muted"}>{CHECKLIST_LABELS[key]}</span>
          </li>
        ))}
      </ul>

      {editable && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="button" className="btn-primary" disabled={!complete || submitting} onClick={handleSubmit}>
            {submitting ? "Submitting…" : data.application?.status === "rejected" ? "Resubmit application" : "Submit application"}
          </button>
          {!complete && <p className="text-sm text-muted">Finish the unchecked items to submit.</p>}
        </div>
      )}
    </StepCard>
  );
}
