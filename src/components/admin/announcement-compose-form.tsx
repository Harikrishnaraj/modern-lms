"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createAnnouncementAction,
  previewTargetCountAction,
  sendAnnouncementAction,
} from "@/features/admin/communication-actions";
import { ROLE_IDS, ROLE_LABEL, type AnnouncementTemplate } from "@/features/admin/communication";

export interface CourseOption {
  id: string;
  title: string;
}

const TARGET_LABEL: Record<string, string> = { all_learners: "All learners", role: "By role", course: "By course" };

export function AnnouncementComposeForm({
  templates,
  courses,
}: {
  templates: AnnouncementTemplate[];
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [targetType, setTargetType] = useState<"all_learners" | "role" | "course">("all_learners");
  const [targetRole, setTargetRole] = useState(ROLE_IDS[0]);
  const [targetCourseId, setTargetCourseId] = useState(courses[0]?.id ?? "");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Flips to "counting…" immediately on every target change, ahead of the debounced fetch below
    // -- a deliberate UX choice (instant feedback that a new count is coming), not something to
    // defer into the timer callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCounting(true);
    const timer = setTimeout(async () => {
      const res = await previewTargetCountAction({
        targetType,
        targetRole: targetType === "role" ? targetRole : null,
        targetCourseId: targetType === "course" ? targetCourseId : null,
      });
      if (cancelled) return;
      setCounting(false);
      setCount(res.ok ? res.count : null);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targetType, targetRole, targetCourseId]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((targetType === "course" && !targetCourseId) || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    const created = await createAnnouncementAction({
      templateId: templateId || null,
      subject,
      body,
      targetType,
      targetRole: targetType === "role" ? targetRole : null,
      targetCourseId: targetType === "course" ? targetCourseId : null,
    });
    if (!created.ok || !created.id) {
      setBusy(false);
      setError(!created.ok ? created.error : "Could not create the announcement.");
      return;
    }
    const sent = await sendAnnouncementAction(created.id);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error);
      return;
    }
    setSuccess(true);
    setSubject("");
    setBody("");
    setTemplateId("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {templates.length > 0 && (
        <Select
          label="Start from a template (optional)"
          placeholder="Blank"
          value={templateId}
          onChange={(e) => applyTemplate(e.target.value)}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Audience"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as typeof targetType)}
          options={Object.entries(TARGET_LABEL).map(([value, label]) => ({ value, label }))}
        />
        {targetType === "role" && (
          <Select
            label="Role"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as typeof targetRole)}
            options={ROLE_IDS.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
        )}
        {targetType === "course" && (
          <Select
            label="Course"
            value={targetCourseId}
            onChange={(e) => setTargetCourseId(e.target.value)}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
          />
        )}
      </div>
      <p className="text-sm text-text-secondary">
        {counting ? "Counting recipients…" : count === null ? "" : `${count.toLocaleString("en-US")} recipient${count === 1 ? "" : "s"}`}
      </p>

      <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Message
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={5000}
          required
          className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
        />
      </label>

      <Button type="submit" disabled={busy || !subject.trim() || !body.trim() || (targetType === "course" && !targetCourseId)}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Send announcement
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      {success && <p className="text-sm text-success-text">Announcement sent.</p>}
    </form>
  );
}
