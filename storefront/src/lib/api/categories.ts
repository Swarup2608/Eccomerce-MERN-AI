import { apiRequest } from "./client";

export interface CatalogCategory {
    _id: string;
    name: string;
    slug: string;
    description?: string;
    image?: string;
    isActive: boolean;
    sortOrder: number;
}

export interface ListCategoriesResponse {
    success: true;
    message: string;
    data: {
        categories: CatalogCategory[];
    };
}

export async function listCategories(): Promise<ListCategoriesResponse> {
    return apiRequest<ListCategoriesResponse>("/categories");
}
