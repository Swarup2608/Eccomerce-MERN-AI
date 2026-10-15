"use client";

import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Badge, Button, Card, Field, Input, Loading, Notice, PageHeader, Select, TextArea } from "@/components/ui";
import { adminApi, flattenTree, type AttributeDef, type AttributeType, type CategoryDetail, type CategoryInput, type CategoryNode } from "@/lib/admin-api";
import { errorMessage } from "@/lib/auth";
import { useLoad } from "@/lib/use-load";
import { confirmDialog } from "@/components/dialog";

const TYPES: { value: AttributeType; label: string }[] = [
  { value: "select", label: "Single choice" },
  { value: "multiselect", label: "Multiple choice" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
];

// The editor keeps options as the raw comma-separated text the admin typed.
interface AttributeRow extends Omit<AttributeDef, "options"> {
  optionsText: string;
  rowId: number;
}

let rowCounter = 0;
const toRow = (def: AttributeDef): AttributeRow => ({ ...def, optionsText: def.options.join(", "), rowId: (rowCounter += 1) });
const emptyRow = (): AttributeRow => toRow({ key: "", label: "", type: "select", options: [], required: false, filterable: true, variantAxis: false });

const EMPTY_FORM: CategoryInput = { name: "", slug: "", description: "", parentId: null, isActive: true, sortOrder: 0, attributes: [] };

export function CategoriesManager() {
  const load = useCallback(() => adminApi.categories(), []);
  const { data, error: loadError, reload } = useLoad(load);
  const [selected, setSelected] = useState<CategoryDetail | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(id: string) {
    setError(null);
    setNotice(null);
    try {
      setSelected(await adminApi.category(id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Each category defines the attributes its products have. Subcategories inherit their parents' attributes."
        actions={
          <Button variant="primary" onClick={() => { setSelected("new"); setNotice(null); setError(null); }}>
            New category
          </Button>
        }
      />
      <FormError message={loadError ?? error} />
      {notice ? <div className="mb-4"><Notice>{notice}</Notice></div> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <Card title="Tree">
          {!data ? <Loading /> : data.tree.length === 0 ? <p className="text-sm text-black/50 dark:text-white/50">No categories yet. Run <code>npm run seed:catalog -w backend</code> for a starter set.</p> : <Tree nodes={data.tree} selectedId={selected && selected !== "new" ? selected.id : null} onSelect={open} />}
        </Card>
        {selected ? (
          <CategoryEditor
            key={selected === "new" ? "new" : `${selected.id}-${selected.attributes.length}`}
            category={selected === "new" ? null : selected}
            tree={data?.tree ?? []}
            onSaved={(category, message) => {
              setSelected(category);
              setNotice(message);
              reload();
            }}
            onDeleted={() => {
              setSelected(null);
              setNotice("Category deleted.");
              reload();
            }}
          />
        ) : (
          <Card>
            <p className="py-10 text-center text-sm text-black/50 dark:text-white/50">Select a category to edit it, or create a new one.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function Tree({ nodes, selectedId, onSelect }: { nodes: CategoryNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {nodes.map((node) => (
        <li key={node.id}>
          <button type="button" onClick={() => onSelect(node.id)} className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${selectedId === node.id ? "bg-black/[0.06] font-medium dark:bg-white/10" : ""}`}>
            <span className="truncate">{node.name}</span>
            {!node.isActive ? <Badge tone="amber">hidden</Badge> : node.attributes.length ? <span className="text-xs text-black/40 dark:text-white/40">{node.attributes.length}</span> : null}
          </button>
          {node.children.length ? (
            <div className="ml-3 border-l border-black/10 pl-2 dark:border-white/10">
              <Tree nodes={node.children} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function CategoryEditor({ category, tree, onSaved, onDeleted }: { category: CategoryDetail | null; tree: CategoryNode[]; onSaved: (category: CategoryDetail, message: string) => void; onDeleted: () => void }) {
  const initial = category ?? EMPTY_FORM;
  const [form, setForm] = useState({ name: initial.name, slug: initial.slug ?? "", description: initial.description, parentId: initial.parentId, isActive: initial.isActive, sortOrder: initial.sortOrder });
  const [rows, setRows] = useState<AttributeRow[]>(() => initial.attributes.map(toRow));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownKeys = new Set(category?.attributes.map((def) => def.key) ?? []);
  const inherited = category?.effectiveAttributes.filter((def) => !ownKeys.has(def.key)) ?? [];
  // A category cannot move under itself or its own descendants.
  const parents = flattenTree(tree).filter(({ category: option }) => !category || (option.id !== category.id && !option.ancestorIds.includes(category.id)));

  const update = (rowId: number, patch: Partial<AttributeRow>) => setRows((current) => current.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const attributes: AttributeDef[] = rows.map(({ optionsText, type, key, label, unit, required, filterable, variantAxis }) => ({
      type,
      required,
      filterable,
      key: key.trim(),
      label: label.trim(),
      unit: unit?.trim() || undefined,
      options: type === "select" || type === "multiselect" ? optionsText.split(",").map((option) => option.trim()).filter(Boolean) : [],
      variantAxis: type === "select" && variantAxis,
    }));
    const input: CategoryInput = { ...form, slug: form.slug.trim() || undefined, attributes };
    try {
      const saved = category ? await adminApi.updateCategory(category.id, input) : await adminApi.createCategory(input);
      onSaved(saved, category ? "Category saved." : "Category created.");
    } catch (err) {
      setError(errorMessage(err));
    }
    setPending(false);
  }

  async function remove() {
    if (!category || !(await confirmDialog({ title: `Delete “${category.name}”?`, message: "This cannot be undone.", confirmLabel: "Delete category", tone: "danger" }))) return;
    setPending(true);
    try {
      await adminApi.deleteCategory(category.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card title={category ? `Edit ${category.name}` : "New category"} actions={category ? <span className="text-xs text-black/50 dark:text-white/50">{category.breadcrumbs.map((crumb) => crumb.name).join(" › ")}</span> : null}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="Slug" hint="Used in the shop URL. Leave empty to generate it from the name.">
            <Input value={form.slug} maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          </Field>
          <Field label="Parent">
            <Select value={form.parentId ?? ""} onChange={(event) => setForm({ ...form, parentId: event.target.value || null })}>
              <option value="">None (top level)</option>
              {parents.map(({ category: option, depth }) => (
                <option key={option.id} value={option.id}>
                  {"  ".repeat(depth)}
                  {option.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort order" hint="Lower numbers come first.">
            <Input type="number" min={0} max={10000} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 0 })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <TextArea maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
            Visible in the shop
          </label>
        </div>
      </Card>

      <Card title="Attributes" actions={<Button onClick={() => setRows([...rows, emptyRow()])}>Add attribute</Button>}>
        <p className="mb-4 text-sm text-black/60 dark:text-white/60">
          <strong>Varies per variant</strong> attributes (like size or colour) get their own SKU, price and stock for each value. <strong>Filterable</strong> ones appear as filters in the shop.
        </p>
        {inherited.length ? (
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className="text-black/50 dark:text-white/50">Inherited:</span>
            {inherited.map((def) => (
              <Badge key={def.key}>
                {def.label}
                {def.variantAxis ? " · variant" : ""}
              </Badge>
            ))}
          </div>
        ) : null}
        {rows.length === 0 ? <p className="text-sm text-black/50 dark:text-white/50">No attributes of its own.</p> : null}
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const isChoice = row.type === "select" || row.type === "multiselect";
            return (
              <div key={row.rowId} className="grid gap-3 rounded-md border border-black/10 p-3 sm:grid-cols-[1fr_1fr_10rem] dark:border-white/10">
                <Field label="Label">
                  <Input required maxLength={50} value={row.label} onChange={(event) => update(row.rowId, { label: event.target.value })} placeholder="Sleeve length" />
                </Field>
                <Field label="Key" hint="Lowercase, e.g. sleeve_length. Changing it later loses existing values.">
                  <Input required pattern="[a-z][a-z0-9_]{0,29}" value={row.key} onChange={(event) => update(row.rowId, { key: event.target.value })} placeholder={row.label ? row.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : "sleeve_length"} />
                </Field>
                <Field label="Type">
                  <Select value={row.type} onChange={(event) => update(row.rowId, { type: event.target.value as AttributeType })}>
                    {TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                {isChoice ? (
                  <Field label="Options" hint="Comma separated. Cannot contain ':'." className="sm:col-span-2">
                    <Input required value={row.optionsText} onChange={(event) => update(row.rowId, { optionsText: event.target.value })} placeholder="S, M, L, XL" />
                  </Field>
                ) : (
                  <Field label="Unit" hint="Optional, e.g. cm, mAh." className="sm:col-span-2">
                    <Input maxLength={15} value={row.unit ?? ""} onChange={(event) => update(row.rowId, { unit: event.target.value })} />
                  </Field>
                )}
                <div className="flex flex-col justify-end gap-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={row.required} onChange={(event) => update(row.rowId, { required: event.target.checked })} /> Required
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={row.filterable} onChange={(event) => update(row.rowId, { filterable: event.target.checked })} /> Filterable
                  </label>
                  <label className={`flex items-center gap-2 ${row.type !== "select" ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={row.type !== "select"} checked={row.type === "select" && row.variantAxis} onChange={(event) => update(row.rowId, { variantAxis: event.target.checked })} /> Varies per variant
                  </label>
                  <Button variant="ghost" className="mt-1 justify-start px-0 text-red-600" onClick={() => setRows(rows.filter((item) => item.rowId !== row.rowId))}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <FormError message={error} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving..." : category ? "Save category" : "Create category"}
        </Button>
        {category ? (
          <Button variant="danger" disabled={pending} onClick={remove}>
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
