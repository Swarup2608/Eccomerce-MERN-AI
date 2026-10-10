"use client";

import { useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { FiFileText, FiTrash2, FiUpload } from "react-icons/fi";
import { errorMessage } from "@/lib/api/client";
import { addDocument, deleteDocument, DOCUMENT_TYPE_LABELS, type DocumentMimeType, type DocumentType } from "@/lib/api/onboarding";
import { uploadFile } from "@/lib/api/uploads";
import { Field, ReadOnlyNotice, StatusPill, StepCard, type StepProps } from "./shared";

const ACCEPTED_TYPES: DocumentMimeType[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export default function DocumentsStep({ data, editable, onSaved }: StepProps) {
  const [type, setType] = useState<DocumentType>("government_id");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type as DocumentMimeType)) {
      toast.error("Upload a PDF, JPG, PNG or WebP file.");
      return;
    }

    setUploading(true);
    try {
      const { publicId } = await uploadFile(file, "vendor_document");
      await addDocument({ type, storageKey: publicId, originalFileName: file.name, mimeType: file.type as DocumentMimeType });
      toast.success("Document uploaded");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "Upload failed."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove(documentId: string) {
    setRemovingId(documentId);
    try {
      await deleteDocument(documentId);
      toast.success("Document removed");
      await onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <StepCard title="Verification documents" description="Upload a government ID plus any business registration or tax documents. Files are stored privately and only our review team can open them.">
      {!editable && <ReadOnlyNotice />}

      {data.documents.length > 0 ? (
        <ul className="mb-6 divide-y divide-border rounded-2xl border border-border">
          {data.documents.map((document) => (
            <li key={document._id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <FiFileText className="shrink-0 text-muted" size={20} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{document.originalFileName}</p>
                <p className="text-xs text-muted">{DOCUMENT_TYPE_LABELS[document.type]}</p>
                {document.rejectionReason && <p className="mt-1 text-xs text-danger">{document.rejectionReason}</p>}
              </div>
              <StatusPill status={document.status} />
              {editable && document.status !== "verified" && (
                <button type="button" aria-label={`Remove ${document.originalFileName}`} className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-danger" disabled={removingId === document._id} onClick={() => handleRemove(document._id)}>
                  <FiTrash2 size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No documents uploaded yet.</p>
      )}

      {editable && (
        <form className="grid gap-4 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end" onSubmit={handleUpload}>
          <Field label="Document type">
            <select className="field" value={type} onChange={(event) => setType(event.target.value as DocumentType)}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="File" hint="PDF, JPG, PNG or WebP, up to 10 MB">
            <input ref={inputRef} className="field file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-primary" type="file" accept={ACCEPTED_TYPES.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <button type="submit" className="btn-primary" disabled={!file || uploading}>
            <FiUpload size={16} />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      )}
    </StepCard>
  );
}
