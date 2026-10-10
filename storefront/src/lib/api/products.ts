import { apiRequest } from "./client";

export interface CatalogProductImage {
    url: string;
    alt?: string;
    isPrimary: boolean;
    sortOrder: number;
}

export interface CatalogProduct {
    _id: string;
    name: string;
    slug: string;
    description: string;
    shortDescription?: string;
    brand?: string;
    categoryId: string;
    images: CatalogProductImage[];
    attributes: Record<string, string>;
    status: "draft" | "active" | "archived";
    createdAt?: string;
    updatedAt?: string;
}

export interface ProductPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface ListProductsResponse {
    success: true;
    message: string;
    data: {
        products: CatalogProduct[];
        pagination: ProductPagination;
    };
}

export interface ListProductsParams {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    brand?: string;
    sortBy?: "newest" | "name";
}

export async function listProducts(
    params: ListProductsParams = {},
): Promise<ListProductsResponse> {
    const query = new URLSearchParams();

    if (params.page !== undefined) {
        query.set("page", String(params.page));
    }

    if (params.limit !== undefined) {
        query.set("limit", String(params.limit));
    }

    if (params.search?.trim()) {
        query.set("search", params.search.trim());
    }

    if (params.categoryId) {
        query.set("categoryId", params.categoryId);
    }

    if (params.brand?.trim()) {
        query.set("brand", params.brand.trim());
    }

    if (params.sortBy) {
        query.set("sortBy", params.sortBy);
    }

    const suffix = query.size > 0 ? `?${query.toString()}` : "";

    return apiRequest<ListProductsResponse>(`/products${suffix}`);
}

export interface GetProductResponse {
    success: true;
    message: string;
    data: {
        product: CatalogProduct;
    };
}

export async function getProductBySlug(slug: string): Promise<GetProductResponse> {
    return apiRequest<GetProductResponse>(`/products/${encodeURIComponent(slug)}`);
}
