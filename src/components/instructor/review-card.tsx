"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CornerDownRight,
  Edit2,
  Loader2,
  MessageSquare,
  Star,
  Trash2,
  User,
} from "lucide-react";
import type { InstructorReview } from "@/features/instructor/reviews";
import {
  deleteReviewReplyAction,
  replyToReviewAction,
} from "@/features/instructor/review-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ReviewCard({ review }: { review: InstructorReview }) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState(review.instructorReply ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await replyToReviewAction({
        reviewId: review.id,
        replyText: replyText.trim(),
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? "Failed to save reply");
      } else {
        setIsReplying(false);
      }
    });
  };

  const handleDeleteReply = async () => {
    if (!confirm("Are you sure you want to delete this reply?")) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteReviewReplyAction({ reviewId: review.id });
      if (!res.ok) {
        setErrorMsg(res.error ?? "Failed to delete reply");
      } else {
        setReplyText("");
        setIsReplying(false);
      }
    });
  };

  const formattedDate = new Date(review.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const formattedRepliedDate = review.repliedAt
    ? new Date(review.repliedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article
      aria-label={`Review by ${review.learnerName}`}
      className="rounded-card border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-sm"
    >
      {/* Header: Learner Info, Rating Stars, Course, Date */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-circle bg-surface-subtle text-text-secondary">
            <User className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text">{review.learnerName}</span>
              <div
                className="flex items-center gap-0.5"
                aria-label={`Rating: ${review.rating} out of 5 stars`}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`size-4 ${
                      s <= review.rating
                        ? "fill-warning text-warning"
                        : "text-border"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <Link
                href={`/instructor/courses/${review.courseSlug}`}
                className="font-medium text-primary hover:underline"
              >
                {review.courseTitle}
              </Link>
              <span>•</span>
              <time dateTime={review.createdAt}>{formattedDate}</time>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div>
          {review.instructorReply ? (
            <Badge tone="success" className="gap-1">
              Replied
            </Badge>
          ) : (
            <Badge tone="warning" className="gap-1">
              Needs Reply
            </Badge>
          )}
        </div>
      </div>

      {/* Review Body */}
      {review.body ? (
        <p className="mt-3.5 text-sm text-text whitespace-pre-line leading-relaxed">
          {review.body}
        </p>
      ) : (
        <p className="mt-3.5 text-sm italic text-text-muted">
          Rating submitted without comment.
        </p>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="mt-3 rounded-control bg-danger-light p-2.5 text-xs text-danger" role="alert">
          {errorMsg}
        </div>
      )}

      {/* Existing Instructor Reply Display */}
      {review.instructorReply && !isReplying && (
        <div className="mt-4 rounded-control border-l-4 border-primary bg-surface-subtle p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <CornerDownRight className="size-3.5" aria-hidden="true" />
              <span>Your Reply</span>
              {formattedRepliedDate && (
                <span className="font-normal text-text-secondary">• {formattedRepliedDate}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Edit reply"
                onClick={() => {
                  setReplyText(review.instructorReply ?? "");
                  setIsReplying(true);
                }}
                className="rounded-control p-1 text-text-secondary hover:bg-border/50 hover:text-text transition-colors"
              >
                <Edit2 className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Delete reply"
                disabled={isPending}
                onClick={handleDeleteReply}
                className="rounded-control p-1 text-danger hover:bg-danger-light transition-colors"
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="size-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          <p className="mt-2 text-sm text-text whitespace-pre-line leading-relaxed">
            {review.instructorReply}
          </p>
        </div>
      )}

      {/* Reply Composer Form */}
      {isReplying && (
        <form onSubmit={handleReplySubmit} className="mt-4 space-y-3 rounded-control border border-border bg-surface-subtle p-3.5">
          <label htmlFor={`reply-${review.id}`} className="text-xs font-semibold text-text">
            {review.instructorReply ? "Edit your reply:" : "Write a reply to the learner:"}
          </label>
          <textarea
            id={`reply-${review.id}`}
            rows={3}
            maxLength={2000}
            required
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Thank the learner for their feedback..."
            className="w-full rounded-control border border-border bg-surface p-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>{replyText.length} / 2000 characters</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setReplyText(review.instructorReply ?? "");
                  setIsReplying(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending || !replyText.trim()}>
                {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
                {review.instructorReply ? "Save changes" : "Post reply"}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Action to trigger reply composer when unreplied */}
      {!review.instructorReply && !isReplying && (
        <div className="mt-3.5 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setReplyText("");
              setIsReplying(true);
            }}
            className="gap-1.5"
          >
            <MessageSquare className="size-3.5" aria-hidden="true" />
            Reply to review
          </Button>
        </div>
      )}
    </article>
  );
}
