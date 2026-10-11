"use client";

import { FiPlus, FiX } from "react-icons/fi";

export type AttributeRow = { key: string; value: string };

export function toRows(attributes: Record<string, string> | undefined): AttributeRow[] {
  const rows = Object.entries(attributes ?? {}).map(([key, value]) => ({ key, value }));
  return rows.length ? rows : [{ key: "", value: "" }];
}

// Rows with both a name and a value become attributes; blank rows are ignored.
export function toRecord(rows: AttributeRow[]): Record<string, string> {
  return Object.fromEntries(rows.filter((row) => row.key.trim() && row.value.trim()).map((row) => [row.key.trim(), row.value.trim()]));
}

export default function AttributesEditor({ rows, onChange, keyPlaceholder, valuePlaceholder, maxRows = 30, label }: { rows: AttributeRow[]; onChange: (rows: AttributeRow[]) => void; keyPlaceholder: string; valuePlaceholder: string; maxRows?: number; label: string }) {
  const update = (index: number, patch: Partial<AttributeRow>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <input className="field" placeholder={keyPlaceholder} aria-label={`${label} name ${index + 1}`} value={row.key} onChange={(event) => update(index, { key: event.target.value })} />
          <input className="field" placeholder={valuePlaceholder} aria-label={`${label} value ${index + 1}`} value={row.value} onChange={(event) => update(index, { value: event.target.value })} />
          <button type="button" aria-label="Remove row" className="rounded-xl px-3 text-muted hover:bg-red-50 hover:text-danger" onClick={() => onChange(rows.length === 1 ? [{ key: "", value: "" }] : rows.filter((_, i) => i !== index))}>
            <FiX size={16} />
          </button>
        </div>
      ))}
      {rows.length < maxRows && (
        <button type="button" className="flex items-center gap-1 text-sm font-semibold text-primary" onClick={() => onChange([...rows, { key: "", value: "" }])}>
          <FiPlus size={14} /> Add row
        </button>
      )}
    </div>
  );
}
