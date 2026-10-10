"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { ApiError, errorMessage } from "@/lib/api/client";
import { saveStore } from "@/lib/api/onboarding";
import { uploadFile } from "@/lib/api/uploads";
import { Field, ReadOnlyNotice, StepCard, type StepProps } from "./shared";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export default function StoreStep({ data, editable, onSaved }: StepProps) {
  const store = data.store;
  const [name, setName] = useState(store?.name ?? data.vendor.businessName);
  const [slug, setSlug] = useState(store?.slug ?? slugify(data.vendor.businessName));
  const [slugEdited, setSlugEdited] = useState(Boolean(store));
  const [description, setDescription] = useState(store?.description ?? "");
  const [logoUrl, setLogoUrl] = useState(store?.logoUrl ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file for your logo.");
      return;
    }

    setUploadingLogo(true);
    try {
      const { url } = await uploadFile(file, "store_branding");
      if (url) {
        setLogoUrl(url);
      } else {
        toast("Image uploads are not configured in this environment, so the logo was skipped.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Logo upload failed."));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await saveStore({
        name: name.trim(),
        slug,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(logoUrl ? { logoUrl } : {}),
      });
      toast.success("Store saved");
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepCard title="Your storefront" description="How shoppers will see your store. It goes live once your application is approved.">
      {!editable && <ReadOnlyNotice />}
      <form className="grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="Store name" error={errors.name}>
          <input
            className="field"
            value={name}
            disabled={!editable}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
            required
          />
        </Field>
        <Field label="Store URL" error={errors.slug} hint={`shopsphere.com/stores/${slug || "your-store"}`}>
          <input
            className="field"
            value={slug}
            disabled={!editable}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
            required
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="About your store (optional)" error={errors.description}>
            <textarea className="field min-h-28" value={description} disabled={!editable} maxLength={2000} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </div>
        <div className="flex items-center gap-4 sm:col-span-2">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-slate-50 text-xs text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="Store logo" className="h-full w-full object-cover" /> : "Logo"}
          </span>
          {editable && (
            <label className="btn-secondary cursor-pointer">
              {uploadingLogo ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
              <input type="file" accept="image/*" className="sr-only" disabled={uploadingLogo} onChange={(event) => handleLogo(event.target.files?.[0])} />
            </label>
          )}
        </div>
        {editable && (
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={saving || uploadingLogo || name.trim().length < 2 || slug.length < 2}>
              {saving ? "Saving…" : "Save store"}
            </button>
          </div>
        )}
      </form>
    </StepCard>
  );
}
