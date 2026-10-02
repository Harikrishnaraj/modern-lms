import { Star } from "lucide-react";
import { ReportReviewButton } from "@/components/courses/report-review-button";
import { ReviewForm } from "@/components/courses/review-form";
import { distributionPercent, type CourseReviews } from "@/features/reviews/reviews";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "size-4 fill-warning text-warning" : "size-4 text-border"} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Ratings summary, the newest reviews, and the write/edit form for learners who completed the course. */
export function CourseReviewsSection({ data, signedIn }: { data: CourseReviews; signedIn: boolean }) {
  const pct = distributionPercent(data.distribution);
  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="space-y-4">
      <h2 id="reviews-heading" className="text-xl font-semibold">
        Reviews
      </h2>

      {data.count === 0 ? (
        <p className="text-sm text-text-secondary">No reviews yet.</p>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="text-4xl font-bold">{data.average.toFixed(1)}</p>
            <Stars value={Math.round(data.average)} />
            <p className="text-sm text-text-secondary">
              {data.count.toLocaleString("en-US")} {data.count === 1 ? "review" : "reviews"}
            </p>
          </div>
          <ul aria-label="Rating distribution" className="min-w-56 flex-1 space-y-1 text-sm">
            {([5, 4, 3, 2, 1] as const).map((n) => (
              <li key={n} className="flex items-center gap-2">
                <span className="w-12 shrink-0">{n} stars</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-border-subtle">
                  <span className="block h-full bg-warning" style={{ width: `${pct[n]}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-text-secondary">
                  {data.distribution[n]} ({pct[n]}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.canReview ? (
        <ReviewForm courseId={data.courseId} initial={data.mine} />
      ) : (
        <p className="text-sm text-text-secondary">
          {signedIn ? "You can review this course once you have completed it." : "Log in and complete this course to leave a review."}
        </p>
      )}

      {data.reviews.length > 0 && (
        <ul aria-label="Reviews" className="space-y-4">
          {data.reviews.map((r) => (
            <li key={r.id} className="space-y-1.5 rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Stars value={r.rating} />
                <span className="font-medium">{r.authorName}</span>
                {r.mine && <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs text-primary-dark">You</span>}
                <span className="text-xs text-text-secondary">{dateFormat.format(new Date(r.createdAt))}</span>
              </div>
              {r.body && <p className="text-sm whitespace-pre-wrap">{r.body}</p>}
              {r.instructorReply && (
                <div className="rounded-control bg-border-subtle p-3 text-sm">
                  <p className="text-xs font-semibold text-text-secondary">Reply from the instructor</p>
                  <p className="whitespace-pre-wrap">{r.instructorReply}</p>
                </div>
              )}
              {signedIn && !r.mine && <ReportReviewButton reviewId={r.id} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
