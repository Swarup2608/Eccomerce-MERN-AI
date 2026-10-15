import type { Metadata } from "next";
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
import { connection } from "next/server";
import { DialogHost } from "@/components/dialog";
import { MotionEffects } from "@/components/motion-effects";
import "./globals.css";

const body = Inter({ variable: "--ff-body", subsets: ["latin"] });
const heading = Inter_Tight({ variable: "--ff-heading", subsets: ["latin"], weight: ["500", "600", "700"] });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Vektor", template: "%s | Vektor" },
  description: "Objects from independent makers, shipped together.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonce-based CSP needs every page rendered per request so each response gets a fresh nonce.
  await connection();

  return (
    <html lang="en" className={`${body.variable} ${heading.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <MotionEffects />
        <DialogHost />
      </body>
    </html>
  );
}
