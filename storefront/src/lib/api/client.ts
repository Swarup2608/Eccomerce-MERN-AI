const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api/v1";

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        requestId?: string;
    };
}

export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly requestId?: string;

    constructor(message: string, statusCode: number, code: string, requestId?: string) {
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.code = code;
        this.requestId = requestId;
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
        
        throw new ApiError(
            errorData?.error?.message ?? "Something went wrong. Please  try again!",
            response.status,
            errorData?.error?.code ?? "API_ERROR",
            errorData?.error?.requestId
        );

    }
    return data as T;
}