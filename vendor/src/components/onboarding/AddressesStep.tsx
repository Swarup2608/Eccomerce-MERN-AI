"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { FiMapPin, FiTrash2 } from "react-icons/fi";
import { ApiError, errorMessage } from "@/lib/api/client";
import { addAddress, ADDRESS_TYPE_LABELS, deleteAddress, type AddressInput, type AddressType } from "@/lib/api/onboarding";
import { Field, ReadOnlyNotice, StepCard, type StepProps } from "./shared";

const EMPTY: AddressInput = { type: "business", recipientName: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "India" };

export default function AddressesStep({ data, editable, onSaved }: StepProps) {
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const hasBusinessAddress = data.addresses.some((address) => address.type === "business");

  const update = (key: keyof AddressInput) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { addressLine2, ...rest } = form;
      await addAddress({ ...rest, ...(addressLine2?.trim() ? { addressLine2: addressLine2.trim() } : {}) });
      toast.success("Address saved");
      setForm({ ...EMPTY, type: hasBusinessAddress ? "warehouse" : "business" });
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(addressId: string) {
    setRemovingId(addressId);
    try {
      await deleteAddress(addressId);
      toast.success("Address removed");
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <StepCard title="Addresses" description="A business address is required. Add a pickup warehouse and a returns address if they differ.">
      {!editable && <ReadOnlyNotice />}

      {data.addresses.length > 0 && (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2">
          {data.addresses.map((address) => (
            <li key={address._id} className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
              <FiMapPin className="mt-0.5 shrink-0 text-primary" size={18} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{ADDRESS_TYPE_LABELS[address.type]}</p>
                <p className="mt-1 text-muted">
                  {address.recipientName} · {address.phone}
                  <br />
                  {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                  <br />
                  {address.city}, {address.state} {address.postalCode}, {address.country}
                </p>
              </div>
              {editable && (
                <button type="button" aria-label="Remove address" className="self-start rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger" disabled={removingId === address._id} onClick={() => handleRemove(address._id)}>
                  <FiTrash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <Field label="Address type" error={errors.type}>
            <select className="field" value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AddressType }))}>
              {Object.entries(ADDRESS_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact name" error={errors.recipientName}>
            <input className="field" value={form.recipientName} onChange={update("recipientName")} required />
          </Field>
          <Field label="Phone" error={errors.phone} hint="Include country code, e.g. +919876543210">
            <input className="field" type="tel" value={form.phone} onChange={update("phone")} required />
          </Field>
          <Field label="Address line 1" error={errors.addressLine1}>
            <input className="field" value={form.addressLine1} onChange={update("addressLine1")} required />
          </Field>
          <Field label="Address line 2 (optional)" error={errors.addressLine2}>
            <input className="field" value={form.addressLine2 ?? ""} onChange={update("addressLine2")} />
          </Field>
          <Field label="City" error={errors.city}>
            <input className="field" value={form.city} onChange={update("city")} required />
          </Field>
          <Field label="State" error={errors.state}>
            <input className="field" value={form.state} onChange={update("state")} required />
          </Field>
          <Field label="Postal code" error={errors.postalCode}>
            <input className="field" value={form.postalCode} onChange={update("postalCode")} required />
          </Field>
          <Field label="Country" error={errors.country}>
            <input className="field" value={form.country} onChange={update("country")} required />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Add address"}
            </button>
          </div>
        </form>
      )}
    </StepCard>
  );
}
