"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowLeft, FiCheck, FiCheckCircle, FiCircle, FiExternalLink, FiFileText, FiLock, FiMapPin, FiX } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, Card, ErrorState, formatDate, formatDateTime, ReasonDialog } from "@/components/ui";
import { changeVendorStatus, getDocumentLink, getVendor, reviewApplication, reviewDocument, setVendorCommission, type VendorDetail } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";

type Dialog = { kind: "reject_application" } | { kind: "suspend" } | { kind: "reject_document"; documentId: string; fileName: string } | null;

const CHECKLIST_LABELS: Record<string, string> = {
  businessDetails: "Business details",
  documents: "Documents",
  bankAccount: "Bank account",
  businessAddress: "Business address",
  store: "Store profile",
};

export default function VendorDetailPage() {
  return (
    <AdminShell>
      <VendorDetailView />
    </AdminShell>
  );
}

function VendorDetailView() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const { data, error, loading, reload } = useApi(`vendor:${vendorId}`, async () => (await getVendor(vendorId)).data);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageSpinner label="Loading vendor…" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setDialog(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const { vendor, application } = data;
  const awaitingReview = application?.status === "submitted";

  return (
    <>
      <Link href="/vendors" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-primary">
        <FiArrowLeft size={14} /> Vendors
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{vendor.businessName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge value={vendor.status} />
            {application && <Badge value={application.status} />}
            <span className="capitalize">{vendor.businessType.replaceAll("_", " ")}</span>
            <span>· joined {formatDate(vendor.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {awaitingReview && (
            <>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDialog({ kind: "reject_application" })}>
                <FiX size={16} /> Reject
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !Object.values(data.checklist).every(Boolean)}
                title={Object.values(data.checklist).every(Boolean) ? undefined : "The application is incomplete"}
                onClick={() => run(() => reviewApplication(vendor._id, "approve"), "Vendor approved and store published")}
              >
                <FiCheck size={16} /> Approve
              </button>
            </>
          )}
          {vendor.status === "active" && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setDialog({ kind: "suspend" })}>
              Suspend vendor
            </button>
          )}
          {vendor.status === "suspended" && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => changeVendorStatus(vendor._id, "reactivate"), "Vendor reactivated")}>
              Reactivate vendor
            </button>
          )}
        </div>
      </div>

      {(vendor.rejectionReason || vendor.suspensionReason || application?.rejectionReason) && (
        <p className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span className="font-bold">{vendor.status === "suspended" ? "Suspended: " : "Rejected: "}</span>
          {vendor.suspensionReason ?? application?.rejectionReason ?? vendor.rejectionReason}
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <DocumentsCard data={data} busy={busy} onVerify={(documentId) => run(() => reviewDocument(vendor._id, documentId, "verified"), "Document verified")} onReject={(documentId, fileName) => setDialog({ kind: "reject_document", documentId, fileName })} />
          <AddressesCard data={data} />
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-black">Application</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Submitted" value={formatDateTime(application?.submittedAt)} />
              <Row label="Reviewed" value={formatDateTime(application?.reviewedAt)} />
            </dl>
            <ul className="mt-4 space-y-2">
              {Object.entries(data.checklist).map(([key, done]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {done ? <FiCheckCircle className="text-success" /> : <FiCircle className="text-slate-300" />}
                  <span className={done ? "" : "text-muted"}>{CHECKLIST_LABELS[key] ?? key}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="font-black">Account owner</h2>
            {data.owner ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                <Row label="Name" value={`${data.owner.firstName} ${data.owner.lastName}`} />
                <Row label="Email" value={data.owner.email} />
                <Row label="Username" value={data.owner.userName} />
                <Row label="Phone" value={data.owner.phoneNumber ?? "—"} />
                <Row label="Account" value={<Badge value={data.owner.status} />} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted">Owner account not found.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-black">Payout account</h2>
            {data.bankAccount ? (
              <div className="mt-3 flex gap-3 text-sm">
                <FiLock className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">
                    {data.bankAccount.bankName} ···· {data.bankAccount.accountNumberLast4}
                  </p>
                  <p className="text-muted">
                    {data.bankAccount.accountHolderName} · IFSC {data.bankAccount.ifscCode}
                  </p>
                  <div className="mt-2">
                    <Badge value={data.bankAccount.isVerified ? "verified" : "pending"} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Not provided.</p>
            )}
          </Card>

          <Card>
            <h2 className="font-black">Store</h2>
            {data.store ? (
              <div className="mt-3 flex gap-3 text-sm">
                {data.store.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.store.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                )}
                <div>
                  <p className="font-semibold">{data.store.name}</p>
                  <p className="text-muted">/{data.store.slug}</p>
                  {data.store.description && <p className="mt-2 text-slate-600">{data.store.description}</p>}
                  <div className="mt-2">
                    <Badge value={data.store.isPublished ? "published" : "draft"} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Not set up yet.</p>
            )}
          </Card>

          <CommissionCard key={vendor.commissionPercent ?? "default"} data={data} onSave={(value) => run(() => setVendorCommission(vendor._id, value), "Commission updated")} busy={busy} />
        </div>
      </div>

      {dialog?.kind === "reject_application" && (
        <ReasonDialog title="Reject application" description="Explain what the seller needs to fix. They can correct it and resubmit." confirmLabel="Reject application" onClose={() => setDialog(null)} onConfirm={(reason) => run(() => reviewApplication(vendor._id, "reject", reason), "Application rejected")} />
      )}
      {dialog?.kind === "suspend" && (
        <ReasonDialog title="Suspend vendor" description="The store is unpublished and the seller cannot list or sell until reactivated." confirmLabel="Suspend vendor" onClose={() => setDialog(null)} onConfirm={(reason) => run(() => changeVendorStatus(vendor._id, "suspend", reason), "Vendor suspended")} />
      )}
      {dialog?.kind === "reject_document" && (
        <ReasonDialog title={`Reject ${dialog.fileName}`} description="Tell the seller why this document can't be accepted." confirmLabel="Reject document" onClose={() => setDialog(null)} onConfirm={(reason) => run(() => reviewDocument(vendor._id, dialog.documentId, "rejected", reason), "Document rejected")} />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function DocumentsCard({ data, busy, onVerify, onReject }: { data: VendorDetail; busy: boolean; onVerify: (documentId: string) => void; onReject: (documentId: string, fileName: string) => void }) {
  const [opening, setOpening] = useState<string | null>(null);

  async function openDocument(documentId: string) {
    // Open the tab synchronously so popup blockers allow it, then point it at the signed link.
    const tab = window.open("about:blank", "_blank");
    setOpening(documentId);
    try {
      const { data: link } = await getDocumentLink(data.vendor._id, documentId);
      if (tab) {
        tab.opener = null;
        tab.location.href = link.url;
      }
    } catch (err) {
      tab?.close();
      toast.error(errorMessage(err, "Could not open the document."));
    } finally {
      setOpening(null);
    }
  }

  return (
    <Card>
      <h2 className="font-black">Documents</h2>
      <p className="mt-1 text-sm text-muted">Links are private and expire after five minutes.</p>
      {data.documents.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No documents uploaded.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {data.documents.map((document) => (
            <li key={document._id} className="flex flex-wrap items-center gap-3 py-3">
              <FiFileText className="shrink-0 text-muted" size={20} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{document.originalFileName}</p>
                <p className="text-xs capitalize text-muted">
                  {document.type.replaceAll("_", " ")} · uploaded {formatDate(document.createdAt)}
                </p>
                {document.rejectionReason && <p className="mt-1 text-xs text-danger">{document.rejectionReason}</p>}
              </div>
              <Badge value={document.status} />
              <button type="button" className="btn-secondary px-3" disabled={opening === document._id} onClick={() => openDocument(document._id)}>
                <FiExternalLink size={14} /> View
              </button>
              {document.status !== "verified" && (
                <button type="button" className="btn-secondary px-3" disabled={busy} onClick={() => onVerify(document._id)}>
                  Verify
                </button>
              )}
              {document.status !== "rejected" && (
                <button type="button" className="btn-secondary px-3 text-danger" disabled={busy} onClick={() => onReject(document._id, document.originalFileName)}>
                  Reject
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddressesCard({ data }: { data: VendorDetail }) {
  return (
    <Card>
      <h2 className="font-black">Addresses</h2>
      {data.addresses.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No addresses added.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.addresses.map((address) => (
            <li key={address._id} className="flex gap-3 rounded-2xl border border-border p-4 text-sm">
              <FiMapPin className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-bold capitalize">{address.type}</p>
                <p className="mt-1 text-muted">
                  {address.recipientName} · {address.phone}
                  <br />
                  {address.addressLine1}
                  {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                  <br />
                  {address.city}, {address.state} {address.postalCode}, {address.country}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CommissionCard({ data, busy, onSave }: { data: VendorDetail; busy: boolean; onSave: (value: number | null) => void }) {
  const [value, setValue] = useState(data.vendor.commissionPercent?.toString() ?? "");
  const parsed = value.trim() === "" ? null : Number(value);
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100);

  return (
    <Card>
      <h2 className="font-black">Commission</h2>
      <p className="mt-1 text-sm text-muted">Currently {data.vendor.effectiveCommissionPercent}% of item sales. Leave blank to use the platform default.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave(parsed);
        }}
      >
        <div className="relative flex-1">
          <input className="field pr-8" inputMode="decimal" placeholder="Platform default" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Commission percent" />
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">%</span>
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !valid}>
          Save
        </button>
      </form>
      {!valid && <p className="mt-1 text-xs text-danger">Enter a number from 0 to 100.</p>}
    </Card>
  );
}
