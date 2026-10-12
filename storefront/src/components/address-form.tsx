"use client";

import { useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, Field, Input, Select } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { INDIAN_STATES, shopApi, type Address, type AddressInput } from "@/lib/shop-api";

const EMPTY: AddressInput = { fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", postalCode: "", isDefault: false };

export function AddressForm({ address, onSaved, onCancel }: { address?: Address; onSaved: (address: Address) => void; onCancel?: () => void }) {
  const [form, setForm] = useState<AddressInput>(address ? { ...address } : EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof AddressInput) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { fullName, phone, line1, line2, landmark, city, state, postalCode, isDefault } = form;
      const input = { fullName, phone, line1, line2, landmark, city, state, postalCode, isDefault };
      onSaved(address ? await shopApi.updateAddress(address.id, input) : await shopApi.createAddress(input));
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name">
        <Input required maxLength={80} autoComplete="name" value={form.fullName} onChange={set("fullName")} />
      </Field>
      <Field label="Mobile number" hint="10 digits; the courier may call.">
        <Input required inputMode="tel" autoComplete="tel-national" pattern="(\+91|0)?[\s-]?[6-9][0-9\s-]{9,11}" value={form.phone} onChange={set("phone")} />
      </Field>
      <Field label="Address line 1" className="sm:col-span-2">
        <Input required maxLength={120} autoComplete="address-line1" placeholder="House no., building, street" value={form.line1} onChange={set("line1")} />
      </Field>
      <Field label="Address line 2 (optional)">
        <Input maxLength={120} autoComplete="address-line2" placeholder="Area, locality" value={form.line2} onChange={set("line2")} />
      </Field>
      <Field label="Landmark (optional)">
        <Input maxLength={80} value={form.landmark} onChange={set("landmark")} />
      </Field>
      <Field label="City">
        <Input required maxLength={60} autoComplete="address-level2" value={form.city} onChange={set("city")} />
      </Field>
      <Field label="PIN code">
        <Input required inputMode="numeric" autoComplete="postal-code" pattern="[1-9][0-9]{5}" maxLength={6} value={form.postalCode} onChange={set("postalCode")} />
      </Field>
      <Field label="State">
        <Select required autoComplete="address-level1" value={form.state} onChange={set("state")}>
          <option value="" disabled>
            Choose a state
          </option>
          {INDIAN_STATES.map((state) => (
            <option key={state}>{state}</option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" checked={form.isDefault} disabled={address?.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
        Make this my default address
      </label>
      <div className="sm:col-span-2">
        <FormError message={error} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving..." : "Save address"}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
