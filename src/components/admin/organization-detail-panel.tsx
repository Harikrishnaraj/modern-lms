"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { LearnerSearchPicker } from "@/components/admin/learner-search-picker";
import type { OrganizationDetail, OrganizationMember } from "@/features/admin/organizations";
import { ORG_NAME_MAX } from "@/features/admin/organizations";
import {
  addOrganizationMemberAction,
  removeOrganizationMemberAction,
  renameOrganizationAction,
  searchOrgCandidatesAction,
  setOrganizationMemberRoleAction,
} from "@/features/admin/organization-actions";
import type { LearnerOption } from "@/features/admin/enrollment-actions";
import { Button } from "@/components/ui/button";

function RenameForm({ org }: { org: OrganizationDetail }) {
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await renameOrganizationAction(org.id, name);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
        Name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          maxLength={ORG_NAME_MAX}
          className="min-w-48 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <Button size="sm" variant="secondary" onClick={save} disabled={busy || name.trim() === org.name}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save
      </Button>
      {saved && <span className="text-xs text-success-text">Saved.</span>}
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: OrganizationMember }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setRole(orgRole: "org_admin" | "member") {
    setBusy(true);
    setError(null);
    const res = await setOrganizationMemberRoleAction(member.memberId, orgRole);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await removeOrganizationMemberAction(member.memberId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="space-y-1 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {member.fullName ?? member.email}
          {member.fullName && <span className="ml-1 text-text-secondary">{member.email}</span>}
          {member.teamName && <span className="ml-2 text-xs text-text-secondary">· {member.teamName}</span>}
        </span>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`role-${member.memberId}`}>
            Role for {member.fullName ?? member.email}
          </label>
          <select
            id={`role-${member.memberId}`}
            value={member.orgRole}
            onChange={(e) => setRole(e.target.value as "org_admin" | "member")}
            disabled={busy}
            className="rounded-control border border-border bg-surface px-2 py-1 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="member">Member</option>
            <option value="org_admin">Org Admin</option>
          </select>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="text-text-secondary hover:text-danger-text"
            aria-label={`Remove ${member.fullName ?? member.email} from the organization`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

export function OrganizationDetailPanel({ org, members }: { org: OrganizationDetail; members: OrganizationMember[] }) {
  const router = useRouter();
  const [candidate, setCandidate] = useState<LearnerOption | null>(null);
  const [orgRole, setOrgRole] = useState<"org_admin" | "member">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMember() {
    if (!candidate) return;
    setBusy(true);
    setError(null);
    const res = await addOrganizationMemberAction(org.id, candidate.userId, orgRole);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCandidate(null);
    setOrgRole("member");
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="details-heading" className="space-y-3">
        <h2 id="details-heading" className="text-base font-semibold">
          Details
        </h2>
        <RenameForm org={org} />
        <dl className="flex flex-wrap gap-6 text-sm">
          <div>
            <dt className="text-xs text-text-secondary">Slug</dt>
            <dd>{org.slug}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Members</dt>
            <dd>{org.memberCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-secondary">Learning hours</dt>
            <dd>{org.learningHours}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="members-heading" className="space-y-3">
        <h2 id="members-heading" className="text-base font-semibold">
          Members ({members.length})
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <LearnerSearchPicker onSelect={setCandidate} selected={candidate} search={(q) => searchOrgCandidatesAction(org.id, q)} placeholder="Search by name or email…" />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-text-secondary">
            Role
            <select
              value={orgRole}
              onChange={(e) => setOrgRole(e.target.value as "org_admin" | "member")}
              className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="member">Member</option>
              <option value="org_admin">Org Admin</option>
            </select>
          </label>
          <Button size="sm" onClick={addMember} disabled={!candidate || busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Add member
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        {members.length === 0 ? (
          <p className="text-sm text-text-secondary">No members yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {members.map((m) => (
              <MemberRow key={m.memberId} member={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
