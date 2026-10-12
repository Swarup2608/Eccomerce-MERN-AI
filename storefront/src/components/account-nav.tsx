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
      <Link href="/account" className="hover:underline">
        Hi, {user.firstName}
      </Link>
    );
  }
  return (
    <>
      <Link href="/login" className="hover:underline">
        Sign in
      </Link>
      <Link href="/register" className="hover:underline">
        Create account
      </Link>
    </>
  );
}
