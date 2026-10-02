import { Star, MessageCircleCheck, AlertCircle } from "lucide-react";
import type { InstructorReviewSummary } from "@/features/instructor/reviews";
import { Card, CardContent } from "@/components/ui/card";

export function ReviewsDistributionCard({ summary }: { summary: InstructorReviewSummary }) {
  const { totalReviews, averageRating, repliedCount, unrepliedCount, distribution, percentages } =
    summary;

  const stars: (5 | 4 | 3 | 2 | 1)[] = [5, 4, 3, 2, 1];

  return (
    <Card className="border border-border bg-surface shadow-xs">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-center">
          {/* Average Rating Score */}
          <div className="flex flex-col items-center justify-center border-b border-border pb-6 md:col-span-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
            <div className="text-5xl font-black tracking-tight text-text">
              {totalReviews > 0 ? averageRating.toFixed(1) : "—"}
            </div>
            <div className="mt-2 flex items-center gap-1" aria-label={`Average rating ${averageRating} out of 5`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`size-5 ${
                    s <= Math.round(averageRating)
                      ? "fill-warning text-warning"
                      : "text-border"
                  }`}
                  aria-hidden="true"
                />
              ))}
            </div>
            <p className="mt-2 text-sm text-text-secondary">
              Based on {totalReviews} {totalReviews === 1 ? "review" : "reviews"}
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-pill bg-success-light px-2.5 py-0.5 text-xs font-medium text-success">
                <MessageCircleCheck className="size-3" aria-hidden="true" />
                {repliedCount} Replied
              </span>
              {unrepliedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-warning-light px-2.5 py-0.5 text-xs font-medium text-warning">
                  <AlertCircle className="size-3" aria-hidden="true" />
                  {unrepliedCount} Unreplied
                </span>
              )}
            </div>
          </div>

          {/* Rating Breakdown Bars */}
          <div className="flex flex-col justify-center space-y-2.5 md:col-span-8 md:pl-2">
            <h2 className="sr-only">Rating distribution</h2>
            {stars.map((star) => {
              const count = distribution[star] ?? 0;
              const pct = percentages[star] ?? 0;
              return (
                <div key={star} className="flex items-center gap-3 text-sm">
                  <div className="flex w-12 items-center gap-1 font-medium text-text">
                    <span>{star}</span>
                    <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                  </div>
                  <div
                    className="h-2.5 flex-1 overflow-hidden rounded-pill bg-surface-subtle"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${star} star rating: ${count} reviews (${pct}%)`}
                  >
                    <div
                      className="h-full rounded-pill bg-warning transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-text-secondary">
                    <span>{count}</span>
                    <span className="ml-1 text-text-muted">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
