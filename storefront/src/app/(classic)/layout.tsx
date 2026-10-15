import { SiteFooter } from "@/components/site-header";

// The original storefront design. The redesigned storefront lives under /v1 with its own layout.
export default function ClassicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
