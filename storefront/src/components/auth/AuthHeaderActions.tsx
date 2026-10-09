"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiLogIn, FiLogOut, FiUser } from "react-icons/fi";
import toast from "react-hot-toast";

import { useAuth } from "@/providers/AuthProvider";

export default function AuthHeaderActions() {
  const { user, isLoading, isAuthenticated, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    try {
      await signOut();
      toast.success("You have been signed out.");
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Unable to sign out. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <div
        aria-label="Loading account"
        className="h-10 w-24 animate-pulse rounded-xl bg-gray-100"
      />
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-bold text-orange-600 transition hover:border-orange-300 hover:bg-orange-50"
      >
        <FiLogIn size={17} />
        <span>Sign in</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/account"
        className="flex items-center gap-2 rounded-xl px-2 py-2 transition hover:bg-orange-50"
        aria-label="View your account"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white">
          <FiUser size={18} />
        </span>

        <span className="hidden text-left sm:block">
          <span className="block text-xs text-gray-500">Welcome back</span>
          <span className="block max-w-28 truncate text-sm font-bold text-gray-900">
            {user.firstName}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={handleSignOut}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
      >
        <FiLogOut size={17} />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}