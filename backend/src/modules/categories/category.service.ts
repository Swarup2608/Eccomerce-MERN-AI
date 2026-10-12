import { trusted, type Types } from "mongoose";
import { z } from "zod";
import { HttpError } from "../../lib/http-error.js";
import { slugify } from "../../lib/pagination.js";
import type { AuditRecorder } from "../audit/audit.service.js";
import { Product } from "../products/product.model.js";
import { Category, type ICategory } from "./category.model.js";
import type { AttributeDef, CreateCategoryInput, UpdateCategoryInput } from "./category.validation.js";

type CategoryDoc = ICategory & { _id: Types.ObjectId };

export interface PublicCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  ancestorIds: string[];
  isActive: boolean;
  sortOrder: number;
  attributes: AttributeDef[];
}

export interface CategoryNode extends PublicCategory {
  children: CategoryNode[];
}

export interface CategoryDetail extends PublicCategory {
  // Inherited from every ancestor, root first, then this category's own.
  effectiveAttributes: AttributeDef[];
  breadcrumbs: { name: string; slug: string }[];
}

export const toPublicCategory = (doc: CategoryDoc): PublicCategory => ({
  id: doc._id.toString(),
  name: doc.name,
  slug: doc.slug,
  description: doc.description,
  parentId: doc.parent ? doc.parent.toString() : null,
  ancestorIds: doc.ancestors.map((id) => id.toString()),
  isActive: doc.isActive,
  sortOrder: doc.sortOrder,
  attributes: doc.attributes.map((def) => ({ key: def.key, label: def.label, type: def.type, options: [...def.options], unit: def.unit ?? undefined, required: def.required, filterable: def.filterable, variantAxis: def.variantAxis })),
});

const notFound = (): HttpError => new HttpError(404, "NOT_FOUND", "Category not found");

const isDuplicateKey = (error: unknown): boolean => typeof error === "object" && error !== null && "code" in error && error.code === 11000;

// Builds the validator for a product's attributes from its category's attribute definitions. Variant axes are not
// product attributes: they are validated per variant by `variantOptionsSchema`.
export function attributeValuesSchema(defs: readonly AttributeDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) {
    if (def.variantAxis) continue;
    let field: z.ZodType;
    switch (def.type) {
      case "text":
        field = z.string().trim().min(1).max(300);
        break;
      case "number":
        field = z.number().finite().min(-1e9).max(1e9);
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "select":
        field = z.enum(def.options as [string, ...string[]], { message: `${def.label} must be one of: ${def.options.join(", ")}` });
        break;
      case "multiselect":
        field = z.array(z.enum(def.options as [string, ...string[]])).min(1).refine((values) => new Set(values).size === values.length, `${def.label} values must be unique`);
        break;
    }
    shape[def.key] = def.required ? field : field.optional();
  }
  return z.object(shape).strict();
}

export function variantOptionsSchema(defs: readonly AttributeDef[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) if (def.variantAxis) shape[def.key] = z.enum(def.options as [string, ...string[]], { message: `${def.label} must be one of: ${def.options.join(", ")}` });
  return z.object(shape).strict();
}

export class CategoryService {
  constructor(private readonly audit: AuditRecorder) {}

  // Every category in tree order. The storefront only sees active ones (and nothing under an inactive parent).
  async tree(options: { includeInactive?: boolean } = {}): Promise<CategoryNode[]> {
    const docs = await Category.find(options.includeInactive ? {} : { isActive: true }).sort({ sortOrder: 1, name: 1 }).lean<CategoryDoc[]>();
    const nodes = new Map(docs.map((doc) => [doc._id.toString(), { ...toPublicCategory(doc), children: [] as CategoryNode[] }]));
    const roots: CategoryNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId === null) roots.push(node);
      else nodes.get(node.parentId)?.children.push(node);
    }
    return roots;
  }

  async list(): Promise<PublicCategory[]> {
    const docs = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean<CategoryDoc[]>();
    return docs.map(toPublicCategory);
  }

  async getById(id: string): Promise<CategoryDetail> {
    const doc = await Category.findById(id).lean<CategoryDoc>();
    if (!doc) throw notFound();
    return this.detail(doc);
  }

  // Storefront lookup: an inactive category, or one under an inactive ancestor, does not exist.
  async getActiveBySlug(slug: string): Promise<CategoryDetail> {
    const doc = await Category.findOne({ slug, isActive: true }).lean<CategoryDoc>();
    if (!doc) throw notFound();
    if (doc.ancestors.length > 0 && (await Category.countDocuments({ _id: trusted({ $in: doc.ancestors }), isActive: true })) !== doc.ancestors.length) throw notFound();
    return this.detail(doc);
  }

  // The category itself plus every descendant, used to list "everything under Clothing".
  async findActiveBySlug(slug: string): Promise<CategoryDoc | null> {
    return Category.findOne({ slug, isActive: true }).lean<CategoryDoc>();
  }

  async effectiveAttributes(categoryId: string | Types.ObjectId): Promise<{ category: CategoryDoc; attributes: AttributeDef[] }> {
    const category = await Category.findById(categoryId).lean<CategoryDoc>();
    if (!category) throw new HttpError(422, "INVALID_CATEGORY", "Category does not exist", [{ path: "categoryId", message: "Category does not exist" }]);
    return { category, attributes: await this.mergedAttributes(category) };
  }

  async create(input: CreateCategoryInput, actorId: string): Promise<CategoryDetail> {
    const parent = input.parentId ? await this.requireParent(input.parentId) : null;
    const ancestors = parent ? [...parent.ancestors, parent._id] : [];
    await this.assertNoInheritedClash(ancestors, input.attributes);

    const slug = input.slug ?? slugify(input.name);
    if (!slug) throw new HttpError(422, "VALIDATION_ERROR", "A slug is required", [{ path: "slug", message: "Required" }]);
    try {
      const doc = await Category.create({ name: input.name, slug, description: input.description, parent: parent?._id ?? null, ancestors, isActive: input.isActive, sortOrder: input.sortOrder, attributes: input.attributes });
      this.audit.record("category_created", { scope: "admin", userId: actorId, meta: { categoryId: doc._id.toString(), slug } });
      return this.detail(doc.toObject());
    } catch (error) {
      if (isDuplicateKey(error)) throw slugTaken();
      throw error;
    }
  }

  async update(id: string, input: UpdateCategoryInput, actorId: string): Promise<CategoryDetail> {
    const current = await Category.findById(id).lean<CategoryDoc>();
    if (!current) throw notFound();

    let ancestors = current.ancestors;
    let parent: Types.ObjectId | null = current.parent;
    const reparenting = input.parentId !== undefined && (input.parentId ?? null) !== (current.parent?.toString() ?? null);
    if (reparenting) {
      if (input.parentId) {
        const newParent = await this.requireParent(input.parentId);
        // A category cannot move under itself or one of its own descendants.
        if (newParent._id.equals(current._id) || newParent.ancestors.some((ancestor) => ancestor.equals(current._id))) {
          throw new HttpError(422, "INVALID_PARENT", "A category cannot be moved under itself or its own subcategory", [{ path: "parentId", message: "Invalid parent" }]);
        }
        parent = newParent._id;
        ancestors = [...newParent.ancestors, newParent._id];
      } else {
        parent = null;
        ancestors = [];
      }
    }

    const attributes = input.attributes ?? current.attributes;
    await this.assertNoInheritedClash(ancestors, attributes);
    if (input.attributes || reparenting) await this.assertNoDescendantClash(current._id, ancestors, attributes);

    const update: Partial<ICategory> = { parent, ancestors, attributes };
    if (input.name !== undefined) update.name = input.name;
    if (input.slug !== undefined) update.slug = input.slug;
    if (input.description !== undefined) update.description = input.description;
    if (input.isActive !== undefined) update.isActive = input.isActive;
    if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;

    let updated: CategoryDoc | null;
    try {
      updated = await Category.findByIdAndUpdate(id, { $set: update }, { returnDocument: "after", runValidators: true }).lean<CategoryDoc>();
    } catch (error) {
      if (isDuplicateKey(error)) throw slugTaken();
      throw error;
    }
    if (!updated) throw notFound();

    if (reparenting) await this.rewriteSubtreePaths(updated);
    this.audit.record("category_updated", { scope: "admin", userId: actorId, meta: { categoryId: id, fields: Object.keys(input) } });
    return this.detail(updated);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const doc = await Category.findById(id).lean<CategoryDoc>();
    if (!doc) throw notFound();
    if (await Category.exists({ parent: doc._id })) throw new HttpError(409, "CATEGORY_HAS_CHILDREN", "Move or delete the subcategories first");
    if (await Product.exists({ category: doc._id })) throw new HttpError(409, "CATEGORY_HAS_PRODUCTS", "Move or delete the products in this category first");
    await Category.deleteOne({ _id: doc._id });
    this.audit.record("category_deleted", { scope: "admin", userId: actorId, meta: { categoryId: id, slug: doc.slug } });
  }

  private async detail(doc: CategoryDoc): Promise<CategoryDetail> {
    const ancestors = doc.ancestors.length ? await Category.find({ _id: trusted({ $in: doc.ancestors }) }).lean<CategoryDoc[]>() : [];
    const ordered = doc.ancestors.map((id) => ancestors.find((ancestor) => ancestor._id.equals(id))).filter((ancestor): ancestor is CategoryDoc => Boolean(ancestor));
    return {
      ...toPublicCategory(doc),
      effectiveAttributes: [...ordered.flatMap((ancestor) => toPublicCategory(ancestor).attributes), ...toPublicCategory(doc).attributes],
      breadcrumbs: [...ordered, doc].map((item) => ({ name: item.name, slug: item.slug })),
    };
  }

  private async mergedAttributes(doc: CategoryDoc): Promise<AttributeDef[]> {
    return (await this.detail(doc)).effectiveAttributes;
  }

  private async requireParent(parentId: string): Promise<CategoryDoc> {
    const parent = await Category.findById(parentId).lean<CategoryDoc>();
    if (!parent) throw new HttpError(422, "INVALID_PARENT", "Parent category does not exist", [{ path: "parentId", message: "Parent category does not exist" }]);
    return parent;
  }

  // A child cannot redefine a key it inherits: products of the child would get two conflicting rules for it.
  private async assertNoInheritedClash(ancestors: readonly Types.ObjectId[], attributes: readonly AttributeDef[]): Promise<void> {
    if (ancestors.length === 0 || attributes.length === 0) return;
    const inherited = await Category.find({ _id: trusted({ $in: [...ancestors] }) }, { attributes: 1 }).lean<CategoryDoc[]>();
    const inheritedKeys = new Set(inherited.flatMap((doc) => doc.attributes.map((def) => def.key)));
    const clashes = attributes.filter((def) => inheritedKeys.has(def.key)).map((def) => def.key);
    if (clashes.length) throw new HttpError(422, "ATTRIBUTE_CONFLICT", `Already defined by a parent category: ${clashes.join(", ")}`, [{ path: "attributes", message: `Inherited keys: ${clashes.join(", ")}` }]);
    const inheritedAxes = inherited.flatMap((doc) => doc.attributes.filter((def) => def.variantAxis)).length;
    if (inheritedAxes + attributes.filter((def) => def.variantAxis).length > 3) throw new HttpError(422, "ATTRIBUTE_CONFLICT", "At most 3 attributes can vary per variant, including inherited ones");
  }

  private async assertNoDescendantClash(id: Types.ObjectId, ancestors: readonly Types.ObjectId[], attributes: readonly AttributeDef[]): Promise<void> {
    const inherited = ancestors.length ? await Category.find({ _id: trusted({ $in: [...ancestors] }) }, { attributes: 1 }).lean<CategoryDoc[]>() : [];
    const keys = new Set([...inherited.flatMap((doc) => doc.attributes.map((def) => def.key)), ...attributes.map((def) => def.key)]);
    const descendants = await Category.find({ ancestors: id }, { attributes: 1, name: 1 }).lean<CategoryDoc[]>();
    for (const descendant of descendants) {
      const clash = descendant.attributes.find((def) => keys.has(def.key));
      if (clash) throw new HttpError(422, "ATTRIBUTE_CONFLICT", `Subcategory "${descendant.name}" already defines "${clash.key}"`, [{ path: "attributes", message: `Defined by subcategory ${descendant.name}` }]);
    }
  }

  // After a move, every descendant's ancestor list and every product's category path below this node must follow.
  private async rewriteSubtreePaths(moved: CategoryDoc): Promise<void> {
    const descendants = await Category.find({ ancestors: moved._id }).lean<CategoryDoc[]>();
    for (const descendant of descendants) {
      const index = descendant.ancestors.findIndex((ancestor) => ancestor.equals(moved._id));
      const ancestors = [...moved.ancestors, moved._id, ...descendant.ancestors.slice(index + 1)];
      await Category.updateOne({ _id: descendant._id }, { $set: { ancestors } });
      await Product.updateMany({ category: descendant._id }, { $set: { categoryPath: [...ancestors, descendant._id] } });
    }
    await Product.updateMany({ category: moved._id }, { $set: { categoryPath: [...moved.ancestors, moved._id] } });
  }
}

const slugTaken = (): HttpError => new HttpError(409, "SLUG_TAKEN", "Another category already uses that slug", [{ path: "slug", message: "Already in use" }]);
