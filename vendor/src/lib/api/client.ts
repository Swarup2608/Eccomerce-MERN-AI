const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

export interface ValidationIssue {
    field: string | null;
    message: string;
}

export interface ApiErrorResponse {
    success: false;
    error: { code: string; message: string; details?: unknown; requestId?: string };
}

export interface ApiResponse<T> {
    success: true;
    message: string;
    data: T;
}

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details: unknown;
    public readonly requestId?: string;

    constructor(message: string, statusCode: number, code: string, requestId?: string, details?: unknown) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.code = code;
        this.requestId = requestId;
        this.details = details;
    }

    get issues(): ValidationIssue[] {
        return Array.isArray(this.details) ? (this.details as ValidationIssue[]) : [];
    }

    /** First validation message per field, keyed by field name. */
    get fieldErrors(): Record<string, string> {
        const errors: Record<string, string> = {};
        for (const issue of this.issues) {
            if (issue.field && !(issue.field in errors)) {
                errors[issue.field] = issue.message;
            }
        }
        return errors;
    }
}

// Access tokens expire after 15 minutes; one refresh is shared by concurrent requests.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
    refreshInFlight ??= fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" })
        .then((response) => response.ok)
        .catch(() => false)
        .finally(() => {
            refreshInFlight = null;
        });
    return refreshInFlight;
}

const NO_RETRY_PATHS = ["/auth/login", "/auth/super-admin/login", "/auth/refresh", "/auth/logout"];

export async function apiRequest<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
        },
    });
    const data: unknown = await response.json().catch(() => null);

    if (response.status === 401 && !retried && !NO_RETRY_PATHS.includes(path)) {
        if (await refreshAccessToken()) {
            return apiRequest<T>(path, options, true);
        }
    }

    if (!response.ok) {
        const errorData = data as Partial<ApiErrorResponse> | null;
        const details = errorData?.error?.details;
        const firstIssue = Array.isArray(details) ? (details[0] as ValidationIssue | undefined) : undefined;

        throw new ApiError(
            // Prefer the specific validation message over the generic "validation failed".
            firstIssue?.message ?? errorData?.error?.message ?? "Something went wrong. Please try again.",
            response.status,
            errorData?.error?.code ?? "API_ERROR",
            errorData?.error?.requestId,
            details,
        );
    }

    return data as T;
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
    return error instanceof Error && error.message ? error.message : fallback;
}
