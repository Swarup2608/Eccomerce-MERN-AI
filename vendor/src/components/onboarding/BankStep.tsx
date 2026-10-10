"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { FiLock } from "react-icons/fi";
import { ApiError, errorMessage } from "@/lib/api/client";
import { saveBankAccount } from "@/lib/api/onboarding";
import { Field, ReadOnlyNotice, StepCard, type StepProps } from "./shared";

const EMPTY = { accountHolderName: "", accountNumber: "", confirmAccountNumber: "", ifscCode: "", bankName: "" };

export default function BankStep({ data, editable, onSaved }: StepProps) {
  const saved = data.bankAccount;
  const [editing, setEditing] = useState(!saved);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (form.accountNumber !== form.confirmAccountNumber) {
      setErrors({ confirmAccountNumber: "Account numbers do not match." });
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await saveBankAccount({
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifscCode: form.ifscCode.trim().toUpperCase(),
        bankName: form.bankName.trim(),
      });
      toast.success("Bank details saved");
      setForm(EMPTY);
      setEditing(false);
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepCard title="Payout bank account" description="Where we send your earnings. The account number is encrypted and only the last four digits are ever shown.">
      {!editable && <ReadOnlyNotice />}

      {saved && !editing && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-primary">
            <FiLock size={18} />
          </span>
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              {saved.bankName} ···· {saved.accountNumberLast4}
            </p>
            <p className="text-muted">
              {saved.accountHolderName} · IFSC {saved.ifscCode}
            </p>
          </div>
          {editable && (
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              Replace account
            </button>
          )}
        </div>
      )}

      {editable && editing && (
        <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Account holder name" error={errors.accountHolderName}>
            <input className="field" value={form.accountHolderName} onChange={update("accountHolderName")} required />
          </Field>
          <Field label="Bank name" error={errors.bankName}>
            <input className="field" value={form.bankName} onChange={update("bankName")} required />
          </Field>
          <Field label="Account number" error={errors.accountNumber}>
            <input className="field" inputMode="numeric" autoComplete="off" value={form.accountNumber} onChange={update("accountNumber")} required />
          </Field>
          <Field label="Confirm account number" error={errors.confirmAccountNumber}>
            <input className="field" inputMode="numeric" autoComplete="off" value={form.confirmAccountNumber} onChange={update("confirmAccountNumber")} onPaste={(event) => event.preventDefault()} required />
          </Field>
          <Field label="IFSC code" error={errors.ifscCode} hint="11 characters, e.g. HDFC0001234">
            <input className="field uppercase" maxLength={11} value={form.ifscCode} onChange={update("ifscCode")} required />
          </Field>
          <div className="flex items-end gap-3 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save bank account"}
            </button>
            {saved && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </StepCard>
  );
}
