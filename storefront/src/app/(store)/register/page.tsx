import type { Metadata } from "next";
import { AuthSplit } from "@/components/auth-shell";
import { LoginForm } from "@/app/(store)/login/login-form";
import { RegisterForm } from "@/app/(store)/register/register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return <AuthSplit initial="register" login={<LoginForm />} register={<RegisterForm />} />;
}
