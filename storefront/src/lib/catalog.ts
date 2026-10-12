import { ApiError, apiFetch, readJson } from "@/lib/api";

// Public catalogue reads. They run in server components and are cached briefly by Next, which also keeps the many
// page renders that share the server's IP well inside the API's per-IP rate limit.
const REVALIDATE_SEC = 60;

export type AttributeValue = string | number | boolean | string[];

export interface AttributeDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "multiselect";
  options: string[];
  unit?: string;
  required: boolean;
  filterable: boolean;
  variantAxis: boolean;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  children: CategoryNode[];
}

export interface CategoryDetail extends Omit<CategoryNode, "children"> {
  effectiveAttributes: AttributeDef[];
  breadcrumbs: { name: string; slug: string }[];
}

export interface ProductImage {
  key: string;
  url: string;
  alt: string;
}

export interface ProductCardData {
  id: string;
  title: string;
  slug: string;
  brand: string;
  image: ProductImage | null;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  inStock: boolean;
  isFeatured: boolean;
}

export interface PublicVariant {
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  available: number;
}

export interface ProductDetail extends ProductCardData {
  description: string;
  category: { id: string; name: string; slug: string };
  breadcrumbs: { name: string; slug: string }[];
  attributes: Record<string, AttributeValue>;
  attributeDefs: AttributeDef[];
  variants: PublicVariant[];
  images: ProductImage[];
  tags: string[];
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Facets {
  facets: { key: string; label: string; values: { value: string; count: number }[] }[];
  price: { min: number; max: number } | null;
}

async function get<T>(path: `/${string}`): Promise<T | null> {
  const res = await apiFetch(path, { next: { revalidate: REVALIDATE_SEC } });
  if (res.status === 404) return null;
  return readJson<T>(res);
}

// Only the params the API understands are forwarded, so a stray query string never turns into a 400.
const LIST_PARAMS = new Set(["q", "category", "brand", "minPrice", "maxPrice", "inStock", "featured", "sort", "page", "limit"]);

export function listQuery(params: Record<string, string | string[] | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw.join(",") : raw;
    if (!value) continue;
    if (LIST_PARAMS.has(key) || /^f_[a-z][a-z0-9_]{0,29}$/.test(key)) search.set(key, value);
  }
  return search.toString();
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  try {
    return (await get<{ categories: CategoryNode[] }>("/api/v1/categories"))?.categories ?? [];
  } catch {
    return [];
  }
}

export const getCategory = async (slug: string): Promise<CategoryDetail | null> => (await get<{ category: CategoryDetail }>(`/api/v1/categories/${encodeURIComponent(slug)}`))?.category ?? null;

export const getProduct = async (slug: string): Promise<ProductDetail | null> => (await get<{ product: ProductDetail }>(`/api/v1/products/${encodeURIComponent(slug)}`))?.product ?? null;

export async function listProducts(query: string): Promise<Page<ProductCardData> | null> {
  try {
    return await get<Page<ProductCardData>>(`/api/v1/products${query ? `?${query}` : ""}`);
  } catch (error) {
    // A bad filter combination (400) shows an empty list rather than an error page.
    if (error instanceof ApiError && error.status === 400) return { items: [], page: 1, limit: 24, total: 0, totalPages: 0 };
    throw error;
  }
}

export async function getFacets(query: string): Promise<Facets> {
  try {
    return (await get<Facets>(`/api/v1/products/facets${query ? `?${query}` : ""}`)) ?? { facets: [], price: null };
  } catch {
    return { facets: [], price: null };
  }
}
