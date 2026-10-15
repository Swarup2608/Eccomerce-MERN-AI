"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

// Session-aware links: "Sign in / Create account" when signed out, the account link when signed in.
export function AccountNav() {
  const user = useSession();

  // Render nothing until the session is known, so the header doesn't flash "Sign in" for a signed-in user.
  if (user === undefined) return null;
  if (user) {
    return (
      <Link href="/account" className="no-underline hover:text-accent-700">
        Hi, {user.firstName}
      </Link>
    );
  }
  return (
    <>
      <Link href="/login" className="no-underline hover:text-accent-700">
        Sign in
      </Link>
      <Link href="/register" className="no-underline hover:text-accent-700">
        Create account
      </Link>
    </>
  );
}
