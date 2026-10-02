"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUser, inviteUser } from "@/features/admin/user-actions";
import { MIN_PASSWORD_LENGTH, PRIVILEGED_ROLES, ROLE_IDS, ROLE_LABEL } from "@/features/admin/user-rules";

export function AddUserPanel({ actorIsSuper }: { actorIsSuper: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "invite" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const roles = ROLE_IDS.filter((r) => actorIsSuper || !(PRIVILEGED_ROLES as readonly string[]).includes(r));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setMessage(null);
    setLink(null);
    const email = String(form.get("email") ?? "");
    const role = String(form.get("role") ?? "learner");
    const r =
      mode === "add"
        ? await createUser({ email, password: String(form.get("password") ?? ""), fullName: String(form.get("fullName") ?? ""), role })
        : await inviteUser({ email, role });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMessage(mode === "add" ? `Account created for ${email}.` : `Invitation created for ${email}. Send them this link:`);
    if (r.link) setLink(r.link);
    if (mode === "add") setMode(null);
    router.refresh();
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === "add" ? "primary" : "secondary"} onClick={() => setMode(mode === "add" ? null : "add")}>
          Add user
        </Button>
        <Button variant={mode === "invite" ? "primary" : "secondary"} onClick={() => setMode(mode === "invite" ? null : "invite")}>
          Invite user
        </Button>
      </div>

      {mode && (
        <form onSubmit={onSubmit} className="grid max-w-2xl gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2" noValidate aria-label={mode === "add" ? "Add user" : "Invite user"}>
          <Input label="Email" type="email" name="email" required autoComplete="off" />
          {mode === "add" && <Input label="Full name" name="fullName" autoComplete="off" />}
          {mode === "add" && (
            <Input label="Temporary password" type="password" name="password" autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters (or the platform's configured minimum, if higher). Share it securely.`} />
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Role
            <select name="role" defaultValue="learner" className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>
              {mode === "add" ? "Create account" : "Create invitation"}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      {message && (
        <div role="status" className="space-y-1 text-sm text-success-text">
          <p>{message}</p>
          {link && <code className="block max-w-2xl overflow-x-auto rounded-control bg-border-subtle p-2 text-xs break-all text-text">{link}</code>}
        </div>
      )}
    </div>
  );
}
