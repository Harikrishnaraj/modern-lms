import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, Users } from "lucide-react";
import { AddUserPanel } from "@/components/admin/add-user-panel";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { USERS_PAGE_SIZE, getAdminUsers, parseUserQuery, type UserQuery } from "@/features/admin/users";
import { ROLE_IDS, ROLE_LABEL } from "@/features/admin/user-rules";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Users" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function href(q: UserQuery, over: Partial<UserQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.role) params.set("role", m.role);
  if (m.status) params.set("status", m.status);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseUserQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "user.read_all"))) {
    return (
      <>
        <PageHeader title="Users" />
        <PermissionDeniedState title="You cannot view users" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [{ users, total }, canManage, { data: myRoles }] = await Promise.all([
    getAdminUsers(supabase, query),
    can(supabase, user.id, "user.manage"),
    supabase.from("user_roles").select("role_id").eq("user_id", user.id),
  ]);
  const actorIsSuper = (myRoles ?? []).some((r) => r.role_id === "super_admin");
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const filtered = query.q !== "" || query.role !== "" || query.status !== "";

  return (
    <>
      <PageHeader title="Users" description={`${total.toLocaleString("en-US")} ${total === 1 ? "account" : "accounts"}`} />

      {canManage && <AddUserPanel actorIsSuper={actorIsSuper} />}

      <form method="get" action="/admin/users" role="search" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search users" type="search" name="q" defaultValue={query.q} maxLength={100} hint="Name or email" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Role
          <select name="role" defaultValue={query.role} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All roles</option>
            {ROLE_IDS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={query.status} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>

      {users.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No users match"
            description="Try a different search, role or status."
            action={
              <Link href="/admin/users" className={buttonClasses({ variant: "secondary" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState icon={Users} title="No users yet" description="Accounts will appear here as people sign up." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">User</th>
                  <th scope="col" className="p-3">Roles</th>
                  <th scope="col" className="p-3">Status</th>
                  <th scope="col" className="p-3">Last sign-in</th>
                  {canManage && <th scope="col" className="p-3">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {users.map((u) => (
                  <tr key={u.userId}>
                    <td className="p-3">
                      <Link href={`/admin/users/${u.userId}`} className="font-medium hover:underline">
                        {u.fullName ?? u.email ?? "Unknown"}
                      </Link>
                      {u.fullName && <p className="text-xs text-text-secondary">{u.email}</p>}
                    </td>
                    <td className="p-3">{u.roles.map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).join(", ") || "None"}</td>
                    <td className="p-3">
                      <StatusBadge kind="user" status={u.status} />
                    </td>
                    <td className="p-3">{u.lastSignInAt ? dateFormat.format(new Date(u.lastSignInAt)) : "Never"}</td>
                    {canManage && (
                      <td className="p-3">
                        <UserRowActions user={u} isSelf={u.userId === user.id} actorIsSuper={actorIsSuper} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {query.page} of {pages}
              </span>
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
