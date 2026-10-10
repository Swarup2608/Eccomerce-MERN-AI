const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

export interface ValidationIssue {
    field: string | null;
    message: string;
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: ValidationIssue[];
        requestId?: string;
    };
}

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details: ValidationIssue[];
    public readonly requestId?: string;

    constructor(message: string, statusCode: number, code: string, requestId?: string, details: ValidationIssue[] = []) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.code = code;
        this.requestId = requestId;
        this.details = details;
    }

    /** First validation message per field, keyed by field name (e.g. { email: "Invalid email address" }). */
    get fieldErrors(): Record<string, string> {
        const errors: Record<string, string> = {};
        for (const issue of this.details) {
            if (issue.field && !(issue.field in errors)) {
                errors[issue.field] = issue.message;
            }
        }
        return errors;
    }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            ...(options.body ? {"Content-Type": "application/json"} : {}),
            ...options.headers,
        },
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const errorData = data as Partial<ApiErrorResponse> | null;
        const details = Array.isArray(errorData?.error?.details) ? errorData.error.details : [];

        throw new ApiError(
            // Prefer the specific validation message over the generic "validation failed".
            details[0]?.message ?? errorData?.error?.message ?? "Something went wrong. Please  try again!",
            response.status,
            errorData?.error?.code ?? "API_ERROR",
            errorData?.error?.requestId,
            details
        );

    }
    return data as T;
}