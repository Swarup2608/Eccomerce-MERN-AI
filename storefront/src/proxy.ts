import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

// Per-request nonce CSP: only scripts Next renders with this nonce may run, which blocks injected scripts (XSS).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' blob: data:${env.imageOrigin ? ` ${env.imageOrigin}` : ""} https://cdn.razorpay.com`,
    "font-src 'self'",
    // Razorpay Checkout (loaded on demand at checkout; 'strict-dynamic' lets our nonce'd bundle add its script) talks to
    // these hosts and shows the payment form in a frame. Stripe Checkout is a full-page redirect and needs nothing here.
    `connect-src 'self' ${env.apiUrl} https://api.razorpay.com https://lumberjack.razorpay.com`,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
