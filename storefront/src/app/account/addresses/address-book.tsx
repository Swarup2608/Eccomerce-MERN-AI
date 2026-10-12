"use client";

import { useEffect, useState } from "react";
import { AddressForm } from "@/components/address-form";
import { FormError } from "@/components/form-field";
import { Button, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { shopApi, type Address } from "@/lib/shop-api";

export function AddressBook() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () =>
    shopApi.addresses().then(
      (loaded) => setAddresses(loaded),
      (err: unknown) => setError(errorMessage(err)),
    );

  useEffect(() => {
    let current = true;
    shopApi.addresses().then(
      (loaded) => current && setAddresses(loaded),
      (err: unknown) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, []);

  async function remove(address: Address) {
    if (!window.confirm("Delete this address?")) return;
    try {
      await shopApi.deleteAddress(address.id);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function makeDefault(address: Address) {
    try {
      await shopApi.updateAddress(address.id, { isDefault: true });
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!addresses) return error ? <FormError message={error} /> : <Loading />;

  if (editing) {
    return (
      <AddressForm
        address={editing === "new" ? undefined : editing}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      {addresses.length === 0 ? <p className="text-sm text-black/60 dark:text-white/60">No saved addresses yet.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {addresses.map((address) => (
          <div key={address.id} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <address className="not-italic leading-relaxed">
              <span className="font-medium">{address.fullName}</span>
              {address.isDefault ? <span className="ml-2 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">Default</span> : null}
              <br />
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ""}
              {address.landmark ? <><br />Near {address.landmark}</> : null}
              <br />
              {address.city}, {address.state} {address.postalCode}
              <br />
              {address.phone}
            </address>
            <div className="flex gap-3 text-xs">
              <button type="button" className="underline" onClick={() => setEditing(address)}>
                Edit
              </button>
              {!address.isDefault ? (
                <button type="button" className="underline" onClick={() => makeDefault(address)}>
                  Make default
                </button>
              ) : null}
              <button type="button" className="text-red-600 underline" onClick={() => remove(address)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {addresses.length < 10 ? (
        <div>
          <Button variant="primary" onClick={() => setEditing("new")}>
            Add an address
          </Button>
        </div>
      ) : null}
    </div>
  );
}
