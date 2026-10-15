import type { Metadata } from "next";
import { AuthSplit } from "@/components/auth-shell";
import { LoginForm } from "../login/login-form";
import { RegisterForm } from "../register/register-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <AuthSplit initial="login" login={<LoginForm />} register={<RegisterForm />} />;
}
