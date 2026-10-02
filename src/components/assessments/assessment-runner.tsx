"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LearnerAssessment, LearnerQuestion } from "@/features/assessments/learner";
import type { Answer, Answers } from "@/features/assessments/grading";
import type { SaveResult, SubmitResult } from "@/features/assessments/attempts";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function QuestionField({
  index,
  q,
  value,
  onChange,
  disabled,
}: {
  index: number;
  q: LearnerQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
  disabled: boolean;
}) {
  const legend = (
    <legend className="mb-2 text-base font-medium">
      <span className="text-text-secondary">Question {index + 1}.</span> {q.prompt}
      <span className="ml-2 text-xs font-normal text-text-secondary">
        ({q.points} {q.points === 1 ? "point" : "points"})
      </span>
    </legend>
  );

  if (q.type === "mcq" || q.type === "true_false") {
    return (
      <fieldset className="rounded-card border border-border bg-surface p-4" disabled={disabled}>
        {legend}
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name={q.id}
                className="size-4 accent-primary"
                checked={value === o.id}
                onChange={() => onChange(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (q.type === "multi") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className="rounded-card border border-border bg-surface p-4" disabled={disabled}>
        {legend}
        <p className="mb-2 text-xs text-text-secondary">Select all that apply.</p>
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={picked.includes(o.id)}
                onChange={() =>
                  onChange(picked.includes(o.id) ? picked.filter((x) => x !== o.id) : [...picked, o.id])
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : "";
  const long = q.type === "essay" || q.type === "coding";
  const id = `q-${q.id}`;
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <label htmlFor={id} className="mb-2 block text-base font-medium">
        <span className="text-text-secondary">Question {index + 1}.</span> {q.prompt}
        <span className="ml-2 text-xs font-normal text-text-secondary">
          ({q.points} {q.points === 1 ? "point" : "points"})
        </span>
      </label>
      {long ? (
        <textarea
          id={id}
          rows={q.type === "coding" ? 10 : 6}
          maxLength={5000}
          disabled={disabled}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-input border border-border bg-surface p-3 text-sm ${q.type === "coding" ? "font-mono" : ""}`}
        />
      ) : (
        <input
          id={id}
          type="text"
          maxLength={500}
          disabled={disabled}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-input border border-border bg-surface px-3 text-sm"
        />
      )}
    </div>
  );
}

export function AssessmentRunner({
  assessment,
  initialAnswers,
  expiresAt,
  onSave,
  onSubmit,
}: {
  assessment: LearnerAssessment;
  initialAnswers: Answers;
  expiresAt: string | null;
  onSave: (answers: Answers) => Promise<SaveResult>;
  onSubmit: (answers: Answers) => Promise<SubmitResult>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(() =>
    expiresAt ? new Date(expiresAt).getTime() - Date.now() : null,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const submittedRef = useRef(false);
  const latest = useRef(answers);
  useEffect(() => {
    latest.current = answers;
  }, [answers]);
  const firstRender = useRef(true);

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(latest.current);
      if ("error" in result) {
        submittedRef.current = false;
        setError(result.error);
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      submittedRef.current = false;
      setError("Something went wrong submitting. Please try again.");
      setSubmitting(false);
    }
  }

  // Autosave (debounced) so attempt state survives reloads and connection drops.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      try {
        const r = await onSave(latest.current);
        setSaveState("error" in r ? "error" : "saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Countdown; submits automatically at zero.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(ms);
      if (ms <= 0) void submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const unanswered = assessment.questions.filter((q) => {
    const a = answers[q.id];
    return a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
  }).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      className="space-y-4"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-card border border-border bg-surface/95 p-3 backdrop-blur">
        <p className="text-sm text-text-secondary" aria-live="polite">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "All answers saved"}
          {saveState === "error" && "Could not save. Check your connection."}
          {saveState === "idle" && "Answers save automatically"}
        </p>
        {remaining !== null && (
          <p
            role="timer"
            aria-label="Time remaining"
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${remaining < 60_000 ? "text-danger-text" : ""}`}
          >
            <Timer className="size-4" aria-hidden="true" />
            {formatRemaining(remaining)}
          </p>
        )}
      </div>

      {assessment.questions.map((q, i) => (
        <QuestionField
          key={q.id}
          index={i}
          q={q}
          value={answers[q.id]}
          disabled={submitting}
          onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
        />
      ))}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm submission"
          className="space-y-3 rounded-card border border-warning bg-warning-light p-4"
        >
          <p className="text-sm font-medium">
            Submit your answers now?{" "}
            {unanswered > 0
              ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered.`
              : "All questions are answered."}{" "}
            You cannot change them afterwards.
          </p>
          <div className="flex gap-2">
            <Button type="button" loading={submitting} onClick={() => void submit()}>
              Yes, submit
            </Button>
            <Button type="button" variant="secondary" disabled={submitting} onClick={() => setConfirming(false)}>
              Keep working
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" size="lg">
          Submit answers
        </Button>
      )}
    </form>
  );
}
