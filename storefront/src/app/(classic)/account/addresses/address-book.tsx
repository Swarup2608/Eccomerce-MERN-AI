"use client";

import { useEffect, useState } from "react";
import { AddressForm } from "@/components/address-form";
import { FormError } from "@/components/form-field";
import { EmptyState, Loading } from "@/components/ui";
import { errorMessage } from "@/lib/auth";
import { shopApi, type Address } from "@/lib/shop-api";
import { confirmDialog } from "@/components/dialog";

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
    if (!(await confirmDialog({ title: "Delete this address?", message: `${address.fullName}, ${address.line1}, ${address.city} will be removed from your address book.`, confirmLabel: "Delete address", tone: "danger" }))) return;
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
      <div className="max-w-[760px] border border-divider p-6 sm:p-8">
        <h2 className="mb-6 mt-0 text-[32px] leading-none">{editing === "new" ? "New address" : "Edit address"}</h2>
        <AddressForm
          address={editing === "new" ? undefined : editing}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FormError message={error} />
      {addresses.length === 0 ? (
        <EmptyState title="No saved addresses." text="Add one now and checkout takes a single click." />
      ) : (
        <div className="grid border-l border-t border-divider sm:grid-cols-2 lg:grid-cols-3">
          {addresses.map((address) => (
            <div key={address.id} className="flex flex-col justify-between gap-5 border-b border-r border-divider p-6 text-sm">
              <address className="not-italic leading-relaxed">
                <span className="mb-1 flex items-center gap-2">
                  <b className="font-heading text-xl font-semibold">{address.fullName}</b>
                  {address.isDefault ? <span className="tag tag-accent">Default</span> : null}
                </span>
                {address.line1}
                {address.line2 ? `, ${address.line2}` : ""}
                {address.landmark ? (
                  <>
                    <br />
                    Near {address.landmark}
                  </>
                ) : null}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                <span className="opacity-65">{address.phone}</span>
              </address>
              <div className="flex flex-wrap gap-4">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(address)}>
                  Edit
                </button>
                {!address.isDefault ? (
                  <button type="button" className="btn btn-ghost" onClick={() => makeDefault(address)}>
                    Make default
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost text-accent-700" onClick={() => remove(address)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {addresses.length < 10 ? (
        <button type="button" className="btn btn-primary self-start" onClick={() => setEditing("new")}>
          + Add an address
        </button>
      ) : null}
    </div>
  );
}
