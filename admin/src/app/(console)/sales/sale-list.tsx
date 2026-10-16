"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { FormError } from "@/components/form-field";
import { Button, ButtonLink, Input, Loading, PageHeader, Pagination, Select, StatusPill, Table } from "@/components/ui";
import { adminApi, SALE_SCOPE_LABELS, SALE_STATUS_LABELS, type SaleSummary } from "@/lib/admin-api";
import { formatDate } from "@/lib/money";
import { useLoad } from "@/lib/use-load";

function scopeText(sale: SaleSummary): string {
  if (sale.appliesTo === "categories") return `${sale.categoryIds.length} ${sale.categoryIds.length === 1 ? "category" : "categories"}`;
  if (sale.appliesTo === "products") return `${sale.productIds.length} ${sale.productIds.length === 1 ? "product" : "products"}`;
  return SALE_SCOPE_LABELS.all;
}

// Filters live in the URL so a filtered list can be bookmarked and the back button works.
export function SaleList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? "1") || 1;
  const [search, setSearch] = useState(q);

  const load = useCallback(() => adminApi.sales({ q, status, page, limit: 25 }), [q, status, page]);
  const { data, error, loading } = useLoad(load);

  const navigate = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries({ page: undefined, ...patch })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  };

  function onSearch(event: FormEvent) {
    event.preventDefault();
    navigate({ q: search.trim() || undefined });
  }

  return (
    <>
      <PageHeader title="Sales" description="Time-boxed discounts on the whole catalogue, some categories or hand-picked products. The best live sale wins." actions={<ButtonLink href="/sales/new" variant="primary">New sale</ButtonLink>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form onSubmit={onSearch} className="flex gap-2">
          <Input type="search" placeholder="Name or slug" value={search} onChange={(event) => setSearch(event.target.value)} className="w-56" />
          <Button type="submit">Search</Button>
        </form>
        <Select value={status} onChange={(event) => navigate({ status: event.target.value || undefined })} aria-label="Status">
          <option value="">All sales</option>
          {Object.entries(SALE_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <FormError message={error} />
      {!data ? (
        loading ? <Loading /> : null
      ) : (
        <>
          <Table
            empty={data.items.length === 0}
            head={
              <tr>
                <th className="px-3 py-2">Sale</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Discount</th>
                <th className="px-3 py-2">Applies to</th>
                <th className="px-3 py-2">Runs</th>
              </tr>
            }
          >
            {data.items.map((sale) => (
              <tr key={sale.id} className={loading ? "opacity-60" : ""}>
                <td className="px-3 py-2">
                  <Link href={`/sales/${sale.id}`} className="font-medium hover:underline">
                    {sale.name}
                  </Link>
                  <p className="font-mono text-xs text-foreground/50">{sale.slug}</p>
                </td>
                <td className="px-3 py-2">
                  <StatusPill status={sale.status} label={SALE_STATUS_LABELS[sale.status]} />
                </td>
                <td className="px-3 py-2 font-semibold">{sale.label}</td>
                <td className="px-3 py-2">{scopeText(sale)}</td>
                <td className="px-3 py-2 text-xs text-foreground/70">
                  {formatDate(sale.startsAt)}
                  <br />→ {formatDate(sale.endsAt)}
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={(next) => navigate({ page: String(next) })} />
        </>
      )}
    </>
  );
}
