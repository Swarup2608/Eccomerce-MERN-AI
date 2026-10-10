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
  FiUser,
} from "react-icons/fi";
import { GiSparkles } from "react-icons/gi";
import toast from "react-hot-toast";

import { ApiError } from "@/lib/api/client";
import { register } from "@/lib/api/auth";
import { FieldError, fieldClassName } from "@/components/auth/FieldError";

type RegisterField =
  | "firstName"
  | "lastName"
  | "userName"
  | "email"
  | "password"
  | "confirmPassword";

export default function RegisterPage() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [userName, setUserName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<RegisterField, string>>
  >({});

  function clearFieldError(field: RegisterField) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function errorProps(field: RegisterField) {
    const message = fieldErrors[field];
    return {
      "aria-invalid": message ? true : undefined,
      "aria-describedby": message ? `${field}-error` : undefined,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setFieldErrors({
        password: "Your password must contain at least 8 characters.",
      });
      return;
    }

    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setFieldErrors({});

    try {
      setIsSubmitting(true);

      const response = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        userName: userName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      toast.success(
        response.message || "Account created. Please verify your email.",
      );

      router.push("/login?registered=true");
    } catch (error: unknown) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setFieldErrors(error.fieldErrors);
        toast.error("Please fix the highlighted fields.");
        return;
      }

      const message =
        error instanceof ApiError
          ? error.message
          : "Unable to create your account. Please try again.";

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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 md:grid-cols-2 md:px-8 md:pt-10">
        <div className="hidden md:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-purple-100 bg-white/80 px-4 py-2 text-sm font-semibold text-purple-600 shadow-sm">
            <GiSparkles />
            Your shopping journey starts here
          </div>

          <h1 className="max-w-lg text-5xl font-black leading-tight tracking-tight text-gray-950 lg:text-6xl">
            Discover more.
            <span className="block bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 bg-clip-text text-transparent">
              Love every find.
            </span>
          </h1>

          <p className="mt-6 max-w-md text-lg leading-8 text-gray-600">
            Create your ShopSphere account to save favourites, manage your
            shopping, and discover products picked for you.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-2 gap-4">
            <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
              <FiShoppingBag className="mb-3 text-orange-500" size={24} />
              <p className="font-bold text-gray-900">One account</p>
              <p className="mt-1 text-sm text-gray-500">
                Your shopping, organised
              </p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
              <GiSparkles className="mb-3 text-purple-500" size={24} />
              <p className="font-bold text-gray-900">More discovery</p>
              <p className="mt-1 text-sm text-gray-500">
                Find your next favourite
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-purple-100/70 sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-pink-100 text-orange-600">
                <FiUser size={25} />
              </div>

              <h2 className="text-3xl font-extrabold tracking-tight text-gray-950">
                Create account
              </h2>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Join ShopSphere and make shopping personal.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="firstName"
                    className="mb-2 block text-sm font-semibold text-gray-700"
                  >
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => {
                      setFirstName(event.target.value);
                      clearFieldError("firstName");
                    }}
                    placeholder="First name"
                    required
                    disabled={isSubmitting}
                    {...errorProps("firstName")}
                    className={`w-full rounded-xl border px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.firstName)}`}
                  />
                  <FieldError id="firstName-error" message={fieldErrors.firstName} />
                </div>

                <div>
                  <label
                    htmlFor="lastName"
                    className="mb-2 block text-sm font-semibold text-gray-700"
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => {
                      setLastName(event.target.value);
                      clearFieldError("lastName");
                    }}
                    placeholder="Last name"
                    required
                    disabled={isSubmitting}
                    {...errorProps("lastName")}
                    className={`w-full rounded-xl border px-3 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.lastName)}`}
                  />
                  <FieldError id="lastName-error" message={fieldErrors.lastName} />
                </div>
              </div>

              <div>
                <label
                  htmlFor="userName"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Username
                </label>
                <div className="relative">
                  <FiUser
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    id="userName"
                    name="userName"
                    autoComplete="username"
                    value={userName}
                    onChange={(event) => {
                      setUserName(event.target.value);
                      clearFieldError("userName");
                    }}
                    placeholder="Choose a username"
                    required
                    disabled={isSubmitting}
                    {...errorProps("userName")}
                    className={`w-full rounded-xl border py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.userName)}`}
                  />
                </div>
                <FieldError id="userName-error" message={fieldErrors.userName} />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Email address
                </label>
                <div className="relative">
                  <FiMail
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      clearFieldError("email");
                    }}
                    placeholder="you@example.com"
                    required
                    disabled={isSubmitting}
                    {...errorProps("email")}
                    className={`w-full rounded-xl border py-3 pl-11 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.email)}`}
                  />
                </div>
                <FieldError id="email-error" message={fieldErrors.email} />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Password
                </label>
                <div className="relative">
                  <FiLock
                    aria-hidden="true"
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      clearFieldError("password");
                    }}
                    placeholder="Create a password"
                    minLength={8}
                    required
                    disabled={isSubmitting}
                    {...errorProps("password")}
                    className={`w-full rounded-xl border py-3 pl-11 pr-12 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.password)}`}
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearFieldError("confirmPassword");
                  }}
                  placeholder="Enter your password again"
                  minLength={8}
                  required
                  disabled={isSubmitting}
                  {...errorProps("confirmPassword")}
                  className={`w-full rounded-xl border px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:bg-white focus:ring-4 disabled:opacity-60 ${fieldClassName(!!fieldErrors.confirmPassword)}`}
                />
                <FieldError
                  id="confirmPassword-error"
                  message={fieldErrors.confirmPassword}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {isSubmitting ? "Creating your account..." : "Create account"}
                {!isSubmitting && (
                  <FiArrowRight className="transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </form>

            <div className="my-6 border-t border-gray-100" />

            <p className="text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-bold text-orange-600 transition hover:text-pink-600"
              >
                Sign in
              </Link>
            </p>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-gray-400">
            After registering, follow the email verification instructions to
            activate your account.
          </p>
        </div>
      </section>
    </main>
  );
}