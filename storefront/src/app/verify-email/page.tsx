"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FiArrowRight,
  FiCheckCircle,
  FiLoader,
  FiMail,
  FiShoppingBag,
  FiXCircle,
} from "react-icons/fi";
import toast from "react-hot-toast";

import { ApiError } from "@/lib/api/client";
import { verifyEmail } from "@/lib/api/auth";

type VerificationStatus = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
    // useSearchParams requires a Suspense boundary for prerendered routes.
    return (
        <Suspense fallback={null}>
            <VerifyEmailContent />
        </Suspense>
    );
}

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get("token")?.trim() ?? "";

    const [status, setStatus] = useState<VerificationStatus>("verifying");
    const [message, setMessage] = useState(
        "Please wait while we verify your email address.",
    );
    const effectiveStatus: VerificationStatus = token ? status : "error";
    const effectiveMessage = token
        ? message
        : "The verification link is missing its token.";

    const requestStarted = useRef(false);

    useEffect(() => {
        if (!token || requestStarted.current) {
            return;
        }

        requestStarted.current = true;

        async function verify() {
            try {
            const response = await verifyEmail(token);

            setStatus("success");
            setMessage(
                response.message || "Your email address has been verified.",
            );
            toast.success("Email verified successfully!");
            } catch (error: unknown) {
            setStatus("error");

            const errorMessage =
                error instanceof ApiError
                ? error.message
                : "We couldn't verify your email. Please try again.";

            setMessage(errorMessage);
            toast.error(errorMessage);
            }
        }

        void verify();
    }, [token]);

    return (
        <main className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-white to-purple-50">
            <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
                <Link
                href="/"
                className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-gray-950"
                >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-lg shadow-orange-200">
                    <FiShoppingBag size={21} />
                </span>
                ShopSphere
                </Link>

                <Link
                href="/"
                className="text-sm font-semibold text-gray-600 transition hover:text-orange-600"
                >
                Back to shop
                </Link>
            </header>

            <section className="flex flex-1 items-center justify-center px-5 pb-16">
                <div className="w-full max-w-lg rounded-3xl border border-white bg-white p-8 text-center shadow-2xl shadow-purple-100/70 sm:p-12">
                <div
                    className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl ${
                    effectiveStatus === "success"
                        ? "bg-emerald-50 text-emerald-600"
                        : effectiveStatus === "error"
                        ? "bg-red-50 text-red-500"
                        : "bg-orange-50 text-orange-500"
                    }`}
                >
                    {effectiveStatus === "verifying" && (
                    <FiLoader className="animate-spin" size={34} />
                    )}

                    {effectiveStatus === "success" && <FiCheckCircle size={38} />}

                    {effectiveStatus === "error" && <FiXCircle size={38} />}
                </div>

                <p className="mb-3 text-sm font-bold uppercase tracking-widest text-orange-500">
                    ShopSphere account
                </p>

                <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">
                    {effectiveStatus === "verifying" && "Verifying your email"}
                    {effectiveStatus === "success" && "You're all set!"}
                    {effectiveStatus === "error" && "Verification unsuccessful"}
                </h1>

                <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-gray-500">
                    {effectiveMessage}
                </p>

                {effectiveStatus === "verifying" && (
                    <div className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-gray-500">
                    <FiMail />
                    Checking your verification link...
                    </div>
                )}

                {effectiveStatus === "success" && (
                    <Link
                    href="/login"
                    className="group mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:shadow-xl"
                    >
                    Continue to sign in
                    <FiArrowRight className="transition-transform group-hover:translate-x-1" />
                    </Link>
                )}

                {effectiveStatus === "error" && (
                    <div className="mt-8 flex flex-col gap-3">
                    <Link
                        href="/login"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3.5 text-sm font-bold text-white transition hover:-translate-y-0.5"
                    >
                        Go to sign in
                        <FiArrowRight />
                    </Link>

                    <Link
                        href="/register"
                        className="rounded-xl border border-gray-200 px-5 py-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                        Create another account
                    </Link>
                    </div>
                )}
                </div>
            </section>
        </main>
    );
}