import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Download, Lock, Paperclip } from "lucide-react";
import { AssignmentForm } from "@/components/assignments/assignment-form";
import { AssignmentInstructions } from "@/components/assignments/assignment-instructions";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getMyAssignment } from "@/features/assignments/queries";
import { getAssignmentResources, withDownloadUrls } from "@/features/assignments/resources";
import { STATUS_LABEL, acceptFor, canSubmit, fileTypeList } from "@/features/assignments/rules";
import { createClient } from "@/lib/supabase/server";
import { formatFileSize } from "@/lib/utils/format";
import { SUBMISSION_BUCKET, supabaseStorage } from "@/services/storage";

export const metadata: Metadata = { title: "Assignment" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const a = await getMyAssignment(supabase, user.id, id);
  if (!a) notFound();

  const sub = a.submission;
  // Reference files the instructor attached; rows come back only for enrolled learners (RLS).
  const resources = await withDownloadUrls(await getAssignmentResources(supabase, a.id));
  // The learner own file, via a short-lived signed URL (the bucket is private).
  let fileUrl: string | null = null;
  if (sub?.filePath) {
    fileUrl = await supabaseStorage.createSignedUrl(SUBMISSION_BUCKET, sub.filePath, 600).catch(() => null);
  }

  return (
    <>
      <Link href="/learner/assignments" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All assignments
      </Link>
      <PageHeader
        title={a.title}
        description={a.courseTitle}
        actions={
          <Badge tone={a.status === "graded" ? "success" : a.status === "overdue" ? "danger" : a.status === "open" ? "info" : "primary"} dot>
            {STATUS_LABEL[a.status]}
          </Badge>
        }
      />

      <div className="max-w-2xl space-y-6">
        <section aria-labelledby="brief-heading" className="space-y-2 rounded-card border border-border bg-surface p-5">
          <h2 id="brief-heading" className="text-base font-semibold">
            Instructions
          </h2>
          {a.instructions.trim() ? (
            <AssignmentInstructions text={a.instructions} />
          ) : (
            <p className="text-sm text-text-secondary">No instructions were provided.</p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-sm">
            <dt className="text-text-secondary">Deadline</dt>
            <dd>{a.dueAt ? `${dateTime.format(new Date(a.dueAt))} UTC${a.allowLate ? " (late work accepted)" : ""}` : "None"}</dd>
            <dt className="text-text-secondary">Points</dt>
            <dd>{a.maxPoints}</dd>
            <dt className="text-text-secondary">Accepts</dt>
            <dd>
              {[a.allowText ? "Written answer" : null, a.allowFile ? `File up to ${a.maxFileMb} MB` : null].filter(Boolean).join(" and ")}
            </dd>
          </dl>
        </section>

        {resources.length > 0 && (
          <section aria-labelledby="resources-heading" className="space-y-2 rounded-card border border-border bg-surface p-5">
            <h2 id="resources-heading" className="text-base font-semibold">
              Reference files
            </h2>
            <ul className="space-y-1.5">
              {resources.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Download className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  {r.url ? (
                    <a href={r.url} download={r.name} rel="noopener noreferrer" className="text-primary underline">
                      {r.name}
                    </a>
                  ) : (
                    <span>{r.name} (unavailable right now)</span>
                  )}
                  <span className="text-text-secondary">({formatFileSize(r.sizeBytes)})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {sub && (
          <section aria-labelledby="mine-heading" className="space-y-2 rounded-card border border-border bg-surface p-5">
            <h2 id="mine-heading" className="text-base font-semibold">
              Your submission
            </h2>
            <p className="text-xs text-text-secondary">
              Submitted {dateTime.format(new Date(sub.submittedAt))} UTC{sub.isLate ? " (late)" : ""}
            </p>
            {sub.text && <p className="text-sm whitespace-pre-wrap">{sub.text}</p>}
            {sub.fileName && (
              <p className="inline-flex items-center gap-1 text-sm">
                <Paperclip className="size-4" aria-hidden="true" />
                {fileUrl ? (
                  <a href={fileUrl} download={sub.fileName} rel="noopener noreferrer" className="text-primary underline">
                    {sub.fileName}
                  </a>
                ) : (
                  sub.fileName
                )}
                {sub.fileSize !== null && <span className="text-text-secondary">({formatFileSize(sub.fileSize)})</span>}
              </p>
            )}
          </section>
        )}

        {sub?.status === "graded" && (
          <section aria-labelledby="grade-heading" className="space-y-2 rounded-card border border-success bg-success-light p-5 text-success-text">
            <h2 id="grade-heading" className="text-base font-semibold">
              Grade and feedback
            </h2>
            <p className="text-lg font-bold">
              {sub.grade ?? 0} / {a.maxPoints}
            </p>
            {sub.feedback ? <p className="text-sm whitespace-pre-wrap">{sub.feedback}</p> : <p className="text-sm">No written feedback.</p>}
          </section>
        )}

        {canSubmit(a.status) ? (
          <AssignmentForm
            assignmentId={a.id}
            allowText={a.allowText}
            allowFile={a.allowFile}
            maxFileMb={a.maxFileMb}
            accept={acceptFor(a.allowedFileTypes)}
            typeList={fileTypeList(a.allowedFileTypes)}
            initialText={sub?.text ?? ""}
            replacing={sub !== null}
          />
        ) : (
          <p role="status" className="flex items-start gap-2 rounded-card border border-border bg-surface p-4 text-sm text-text-secondary">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {a.status === "graded"
              ? "This submission has been graded, so it can no longer be changed."
              : a.status === "overdue"
                ? "The deadline has passed and late submissions are not accepted."
                : "The deadline has passed, so your submission is locked."}
          </p>
        )}
      </div>
    </>
  );
}
