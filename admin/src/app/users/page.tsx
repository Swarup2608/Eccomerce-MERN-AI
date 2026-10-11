"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiSearch } from "react-icons/fi";
import AdminShell, { PageSpinner } from "@/components/AdminShell";
import { Badge, EmptyState, ErrorState, formatDate, PageHeader, Pagination } from "@/components/ui";
import { listUsers, updateUserRole, updateUserStatus, type AdminUser } from "@/lib/api/admin";
import type { UserRole } from "@/lib/api/auth";
import { errorMessage } from "@/lib/api/client";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/providers/AuthProvider";

const ROLES: UserRole[] = ["user", "vendor", "admin", "procurement_officer", "vendor_onboarding_reviewer"];
const ASSIGNABLE_ROLES: UserRole[] = ["user", "admin", "procurement_officer", "vendor_onboarding_reviewer"];
const STATUSES = ["active", "inactive", "suspended"] as const;

const label = (value: string) => value.replaceAll("_", " ");

export default function UsersPage() {
  return (
    <AdminShell>
      <Users />
    </AdminShell>
  );
}

function Users() {
  const { user: me, isSuperAdmin } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { data, error, loading, reload } = useApi(`users:${search}:${role}:${status}:${page}`, async () => (await listUsers({ search, role, status, page })).data);

  async function save(user: AdminUser, change: () => Promise<unknown>, message: string) {
    setSavingId(user._id);
    try {
      await change();
      toast.success(message);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  // Only the Super Admin may change another administrator.
  const canEditStatus = (user: AdminUser) => user._id !== me?._id && (isSuperAdmin || !["admin", "super_admin"].includes(user.role));
  const canEditRole = (user: AdminUser) => isSuperAdmin && user._id !== me?._id && user.role !== "vendor";

  return (
    <>
      <PageHeader eyebrow="People" title="Users" description={isSuperAdmin ? "Manage account status and staff roles." : "Manage customer and seller account status. Role changes need the Super Admin."} />

      <div className="mb-4 flex flex-wrap gap-3">
        <form
          className="relative min-w-60 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" size={16} />
          <input className="field pl-9" placeholder="Search name, email or username" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label="Search users" />
        </form>
        <select className="field w-auto capitalize" aria-label="Filter by role" value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {ROLES.map((value) => (
            <option key={value} value={value}>
              {label(value)}
            </option>
          ))}
        </select>
        <select className="field w-auto capitalize" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <PageSpinner label="Loading users…" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.users.length === 0 ? (
        <EmptyState title="No users match" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Email</th>
                  <th>Last sign-in</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user._id} className={savingId === user._id ? "opacity-60" : undefined}>
                    <td>
                      <span className="block font-semibold">
                        {user.firstName} {user.lastName}
                      </span>
                      <span className="text-xs text-muted">
                        @{user.userName} · {user.email}
                      </span>
                    </td>
                    <td>
                      {canEditRole(user) ? (
                        <select className="field w-auto py-1.5 capitalize" aria-label={`Role for ${user.email}`} value={user.role} disabled={savingId === user._id} onChange={(event) => save(user, () => updateUserRole(user._id, event.target.value as UserRole), "Role updated")}>
                          {ASSIGNABLE_ROLES.map((value) => (
                            <option key={value} value={value}>
                              {label(value)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize">{label(user.role)}</span>
                      )}
                    </td>
                    <td>
                      {canEditStatus(user) ? (
                        <select className="field w-auto py-1.5 capitalize" aria-label={`Status for ${user.email}`} value={user.status} disabled={savingId === user._id || user.status === "deleted"} onChange={(event) => save(user, () => updateUserStatus(user._id, event.target.value as (typeof STATUSES)[number]), "Status updated")}>
                          {STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge value={user.status} />
                      )}
                    </td>
                    <td>{user.emailVerified ? <Badge value="verified" /> : <Badge value="pending" />}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(user.lastLoginAt)}</td>
                    <td className="whitespace-nowrap text-muted">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={data.pagination} onPage={setPage} />
        </>
      )}
    </>
  );
}
