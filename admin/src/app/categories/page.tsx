"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, Card, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { createCategory, deleteCategory, listCategories, updateCategory, type Category } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { slugify } from "@/lib/slugify";
import { useApi } from "@/lib/useApi";

export default function CategoriesPage() {
  return (
    <AdminShell>
      <Categories />
    </AdminShell>
  );
}

function Categories() {
  const { data, error, loading, reload } = useApi("categories", async () => (await listCategories()).data.categories);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(category: Category) {
    setBusyId(category._id);
    try {
      await updateCategory(category._id, { isActive: !category.isActive });
      toast.success(category.isActive ? "Category hidden from the storefront" : "Category is live");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete "${category.name}"? This cannot be undone.`)) return;
    setBusyId(category._id);
    try {
      await deleteCategory(category._id);
      toast.success("Category deleted");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Categories"
        description="Hidden categories stay attached to their products but disappear from the storefront."
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
            <FiPlus size={16} /> New category
          </button>
        }
      />

      {editing && (
        <CategoryForm
          key={editing === "new" ? "new" : editing._id}
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {loading && !data ? (
        <PageSpinner label="Loading categories…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No categories yet" description="Create one to start building the catalog." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((category) => (
                <tr key={category._id} className={busyId === category._id ? "opacity-60" : undefined}>
                  <td className="tabular-nums text-muted">{category.sortOrder}</td>
                  <td>
                    <span className="block font-semibold">{category.name}</span>
                    {category.description && <span className="line-clamp-1 text-xs text-muted">{category.description}</span>}
                  </td>
                  <td className="font-mono text-xs text-muted">{category.slug}</td>
                  <td>
                    <Badge value={category.isActive ? "active" : "inactive"} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn-secondary px-3" disabled={busyId === category._id} onClick={() => toggleActive(category)}>
                        {category.isActive ? "Hide" : "Show"}
                      </button>
                      <button type="button" aria-label={`Edit ${category.name}`} className="btn-secondary px-3" onClick={() => setEditing(category)}>
                        <FiEdit2 size={14} />
                      </button>
                      <button type="button" aria-label={`Delete ${category.name}`} className="btn-secondary px-3 hover:!text-danger" disabled={busyId === category._id} onClick={() => remove(category)}>
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CategoryForm({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(category));
  const [description, setDescription] = useState(category?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const input = { name: name.trim(), slug, description: description.trim() || undefined, sortOrder: Number(sortOrder) || 0 };
    try {
      if (category) {
        await updateCategory(category._id, input);
      } else {
        await createCategory(input);
      }
      toast.success(category ? "Category updated" : "Category created");
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="font-black">{category ? `Edit ${category.name}` : "New category"}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_120px]" onSubmit={handleSubmit}>
        <label className="text-sm font-semibold">
          Name
          <input
            className="field mt-1.5"
            value={name}
            maxLength={100}
            required
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(slugify(event.target.value));
            }}
          />
        </label>
        <label className="text-sm font-semibold">
          Slug
          <input
            className="field mt-1.5 font-mono"
            value={slug}
            required
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(slugify(event.target.value));
            }}
          />
        </label>
        <label className="text-sm font-semibold">
          Sort order
          <input className="field mt-1.5" type="number" min={0} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
        <label className="text-sm font-semibold sm:col-span-3">
          Description (optional)
          <input className="field mt-1.5" value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="flex gap-2 sm:col-span-3">
          <button type="submit" className="btn-primary" disabled={saving || name.trim().length < 2 || slug.length < 2}>
            {saving ? "Saving…" : "Save category"}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
