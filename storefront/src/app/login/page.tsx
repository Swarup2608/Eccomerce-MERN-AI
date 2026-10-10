"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiShoppingBag,
} from "react-icons/fi";
import { GiSparkles } from "react-icons/gi";
import toast from "react-hot-toast";

import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/providers/AuthProvider";
import { FieldError, fieldClassName } from "@/components/auth/FieldError";

type LoginField = "identifier" | "password";

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<LoginField, string>>
  >({});

  function clearFieldError(field: LoginField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function errorProps(field: LoginField) {
    const message = fieldErrors[field];
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${field}-error` : undefined,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!identifier.trim() || !password) {
      toast.error("Please enter your email or username and password.");
      return;
    }

    setFieldErrors({});

    try {
      setIsSubmitting(true);

      const response = await signIn({
        identifier: identifier.trim(),
        password,
      });

      toast.success(response.message || "Welcome back!");

      router.replace("/");
      router.refresh();
    } catch (error: unknown) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setFieldErrors(error.fieldErrors);
        toast.error("Please fix the highlighted fields.");
        return;
      }

      const message =
        error instanceof ApiError
          ? error.message
          : "Unable to connect to the server. Please try again.";

      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
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
          className="flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-orange-600"
        >
          <FiArrowLeft />
          Back to shop
        </Link>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 md:grid-cols-2 md:px-8 md:pt-12">
        <div className="hidden md:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white/80 px-4 py-2 text-sm font-semibold text-orange-600 shadow-sm">
            <GiSparkles />
            Your next favourite thing awaits
          </div>

          <h1 className="max-w-lg text-5xl font-black leading-tight tracking-tight text-gray-950 lg:text-6xl">
            Good to see
            <span className="block bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 bg-clip-text text-transparent">
              you again.
            </span>
          </h1>

          <p className="mt-6 max-w-md text-lg leading-8 text-gray-600">
            Sign in to pick up where you left off, revisit your favourites,
            and discover something you will love.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900">
                Your favourites
              </p>
              <p className="mt-1 text-sm text-gray-500">
                All in one place
              </p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900">
                Your shopping
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Made personal
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-purple-100/70 sm:p-9">
            <div className="mb-8">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-pink-100 text-orange-600">
                <FiLock size={25} />
              </div>

              <h2 className="text-3xl font-extrabold tracking-tight text-gray-950">
                Welcome back
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Enter your details to sign in to your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="identifier"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Email or username
                </label>

                <div className="relative">
                  <FiMail
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    size={19}
                  />

                  <input
                    id="identifier"
                    name="identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => {
                      setIdentifier(event.target.value);
                      clearFieldError("identifier");
                    }}
                    placeholder="you@example.com"
                    required
                    disabled={isSubmitting}
                    {...errorProps("identifier")}
                    className={`w-full rounded-xl border py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${fieldClassName(!!fieldErrors.identifier)}`}
                  />
                </div>
                <FieldError id="identifier-error" message={fieldErrors.identifier} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-gray-700"
                  >
                    Password
                  </label>
                </div>

                <div className="relative">
                  <FiLock
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    size={19}
                  />

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearFieldError("password");
                    }}
                    placeholder="Enter your password"
                    required
                    disabled={isSubmitting}
                    {...errorProps("password")}
                    className={`w-full rounded-xl border py-3.5 pl-12 pr-12 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${fieldClassName(!!fieldErrors.password)}`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <FiEyeOff size={18} />
                    ) : (
                      <FiEye size={18} />
                    )}
                  </button>
                </div>
                <FieldError id="password-error" message={fieldErrors.password} />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isSubmitting ? "Signing you in..." : "Sign in"}
                {!isSubmitting && (
                  <FiArrowRight className="transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </form>

            <div className="my-7 border-t border-gray-100" />

            <p className="text-center text-sm text-gray-600">
              New to ShopSphere?{" "}
              <Link
                href="/register"
                className="font-bold text-orange-600 transition hover:text-pink-600"
              >
                Create an account
              </Link>
            </p>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-gray-400">
            Your account security matters. Authentication is handled by our
            secure backend.
          </p>
        </div>
      </section>
    </main>
  );
}