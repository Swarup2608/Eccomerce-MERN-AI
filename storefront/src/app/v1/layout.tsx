import type { Metadata } from "next";
import { SiteFooterV1 } from "@/components/v1/site-header";
import { BasePathProvider } from "@/lib/base-path";

export const metadata: Metadata = { title: { default: "Vektor", template: "%s | Vektor" } };

// The redesigned storefront ("Vektor Store v3"): every page of the original, under /v1, with rounded corners,
// a glass header and overlay product cards. Shared client views keep their links inside /v1 via BasePathProvider.
export default function V1Layout({ children }: LayoutProps<"/v1">) {
  return (
    <BasePathProvider base="/v1">
      <div className="vk-v1 flex flex-1 flex-col">
        {children}
        <SiteFooterV1 />
      </div>
    </BasePathProvider>
  );
}
