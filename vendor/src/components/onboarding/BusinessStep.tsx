"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { ApiError, errorMessage } from "@/lib/api/client";
import { BUSINESS_TYPE_LABELS, updateBusiness, type BusinessType } from "@/lib/api/onboarding";
import { Field, ReadOnlyNotice, StepCard, type StepProps } from "./shared";

export default function BusinessStep({ data, editable, onSaved }: StepProps) {
  const [businessName, setBusinessName] = useState(data.vendor.businessName);
  const [businessType, setBusinessType] = useState<BusinessType>(data.vendor.businessType);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    try {
      await updateBusiness({ businessName: businessName.trim(), businessType });
      toast.success("Business details saved");
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepCard title="Business details" description="The legal name and structure of the business that will sell on ShopSphere.">
      {!editable && <ReadOnlyNotice />}
      <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Registered business name" error={errors.businessName}>
          <input className="field" value={businessName} onChange={(event) => setBusinessName(event.target.value)} disabled={!editable} maxLength={150} required />
        </Field>
        <Field label="Business type" error={errors.businessType}>
          <select className="field" value={businessType} onChange={(event) => setBusinessType(event.target.value as BusinessType)} disabled={!editable}>
            {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {editable && (
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving || businessName.trim().length < 2}>
              {saving ? "Saving…" : "Save and continue"}
            </button>
          </div>
        )}
      </form>
    </StepCard>
  );
}
