"use client";

import { useState, useTransition } from "react";
import { setRolePermissionAction } from "@/features/admin/role-actions";
import type { PermissionDef } from "@/features/admin/roles";
import { ROLE_LABEL, type RoleId } from "@/features/admin/user-rules";

const LOCKED = new Set(["permissions.manage", "user.manage", "portal.admin.access"]);

export function RoleMatrix({
  roleIds,
  permissions,
  initialGrants,
}: {
  roleIds: string[];
  permissions: PermissionDef[];
  initialGrants: Record<string, string[]>;
}) {
  const [grants, setGrants] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(roleIds.map((r) => [r, new Set(initialGrants[r] ?? [])])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(roleId: string, permissionId: string) {
    const key = `${roleId}:${permissionId}`;
    const nextGranted = !grants[roleId]?.has(permissionId);
    if (roleId === "super_admin" && !nextGranted && LOCKED.has(permissionId)) {
      setError("This permission cannot be removed from Super Admin.");
      return;
    }

    setError(null);
    setPendingKey(key);
    setGrants((prev) => {
      const next = { ...prev, [roleId]: new Set(prev[roleId]) };
      if (nextGranted) next[roleId].add(permissionId);
      else next[roleId].delete(permissionId);
      return next;
    });

    startTransition(async () => {
      const res = await setRolePermissionAction(roleId, permissionId, nextGranted);
      setPendingKey(null);
      if (!res.ok) {
        setError(res.error);
        // Roll back the optimistic change.
        setGrants((prev) => {
          const next = { ...prev, [roleId]: new Set(prev[roleId]) };
          if (nextGranted) next[roleId].delete(permissionId);
          else next[roleId].add(permissionId);
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-border-subtle text-xs text-neutral-text uppercase">
            <tr>
              <th scope="col" className="p-2">
                Permission
              </th>
              {roleIds.map((r) => (
                <th key={r} scope="col" className="p-2 text-center">
                  {ROLE_LABEL[r as RoleId] ?? r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {permissions.map((perm) => (
              <tr key={perm.id}>
                <td className="p-2">
                  <p className="font-medium">{perm.id}</p>
                  <p className="text-xs text-text-secondary">{perm.description}</p>
                </td>
                {roleIds.map((roleId) => {
                  const key = `${roleId}:${perm.id}`;
                  const checked = grants[roleId]?.has(perm.id) ?? false;
                  const locked = roleId === "super_admin" && checked && LOCKED.has(perm.id);
                  return (
                    <td key={key} className="p-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={checked}
                        disabled={pendingKey === key || locked}
                        title={locked ? "Cannot be removed from Super Admin" : undefined}
                        onChange={() => toggle(roleId, perm.id)}
                        aria-label={`${ROLE_LABEL[roleId as RoleId] ?? roleId}: ${perm.id}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
