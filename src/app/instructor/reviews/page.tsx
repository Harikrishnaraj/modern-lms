import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, PlusCircle, Star } from "lucide-react";
import {
  filterAndSortReviews,
  getInstructorReviews,
  getInstructorReviewSummary,
  parseRatingFilter,
  parseSortOption,
  parseStatusFilter,
} from "@/features/instructor/reviews";
import { parseCourseFilter } from "@/features/instructor/analytics";
import { getInstructorCourses } from "@/features/instructor/courses";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { ReviewCard } from "@/components/instructor/review-card";
import { ReviewsDistributionCard } from "@/components/instructor/reviews-distribution-card";
import { ReviewsFilterBar } from "@/components/instructor/reviews-filter-bar";

export const metadata: Metadata = {
  title: "Reviews & Feedback | Instructor",
  description: "Monitor learner ratings, review distribution, and reply to feedback.",
};

interface Props {
  searchParams: Promise<{
    course?: string | string[];
    rating?: string | string[];
    status?: string | string[];
    sort?: string | string[];
    q?: string | string[];
  }>;
}

export default async function InstructorReviewsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/instructor/reviews");
  }

  const resolvedParams = await searchParams;
  const selectedCourseId = parseCourseFilter(resolvedParams.course);
  const selectedRating = parseRatingFilter(resolvedParams.rating);
  const selectedStatus = parseStatusFilter(resolvedParams.status);
  const selectedSort = parseSortOption(resolvedParams.sort);
  const searchQuery = (Array.isArray(resolvedParams.q) ? resolvedParams.q[0] : resolvedParams.q)?.trim() ?? "";

  // 1. Fetch courses owned by the instructor
  const courses = await getInstructorCourses(supabase);

  // If instructor has no courses yet
  if (courses.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Reviews"
          description="Learner ratings and feedback across your courses."
        />
        <EmptyState
          icon={Star}
          title="No courses yet"
          description="Create and publish your first course to begin receiving ratings and reviews from learners."
          action={
            <Link
              href="/instructor/courses/new"
              className={buttonClasses({ variant: "primary", size: "md" })}
            >
              <PlusCircle className="mr-2 size-4" aria-hidden="true" />
              Create Course
            </Link>
          }
        />
      </div>
    );
  }

  // 2. Fetch reviews and summary for the selected course (or all courses)
  const [allReviews, summary] = await Promise.all([
    getInstructorReviews(supabase, selectedCourseId),
    getInstructorReviewSummary(supabase, selectedCourseId),
  ]);

  // 3. Filter and sort reviews according to user query parameters
  const filteredReviews = filterAndSortReviews(allReviews, {
    rating: selectedRating,
    status: selectedStatus,
    sort: selectedSort,
    search: searchQuery,
  });

  const courseOptions = courses.map((c) => ({
    id: c.courseId,
    title: c.title,
  }));

  const selectedCourse = selectedCourseId
    ? courses.find((c) => c.courseId === selectedCourseId)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description="Monitor learner satisfaction, analyze rating distribution, and reply to course feedback."
      />

      {/* Rating distribution & KPIs */}
      <ReviewsDistributionCard summary={summary} />

      {/* Filter and search bar */}
      <ReviewsFilterBar
        courses={courseOptions}
        selectedCourseId={selectedCourseId}
        selectedRating={selectedRating}
        selectedStatus={selectedStatus}
        selectedSort={selectedSort}
        searchQuery={searchQuery}
      />

      {/* Review list or empty filter results */}
      {allReviews.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No reviews yet"
          description={
            selectedCourse
              ? `No reviews have been submitted for "${selectedCourse.title}" yet.`
              : "Reviews submitted by learners who complete your courses will appear here."
          }
        />
      ) : filteredReviews.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No matching reviews"
          description="Try adjusting your course, rating, status, or search filters to find reviews."
          action={
            <Link
              href="/instructor/reviews"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Reset filters
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>
              Showing {filteredReviews.length} of {allReviews.length}{" "}
              {allReviews.length === 1 ? "review" : "reviews"}
            </span>
          </div>

          <div className="space-y-3">
            {filteredReviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
