import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Globe,
  PlayCircle,
  ClipboardList,
  HelpCircle,
  Package,
  Star,
  type LucideIcon,
} from "lucide-react";
import { CourseReviewsSection } from "@/components/courses/course-reviews";
import { EnrollmentPanel } from "@/components/courses/enrollment-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  descriptionParagraphs,
  getCourseDetail,
  type OutlineLesson,
} from "@/features/catalog/course-detail";
import { LANGUAGE_OPTIONS, LEVEL_OPTIONS } from "@/features/catalog/filters";
import { getCourseReviews } from "@/features/reviews/reviews";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPrice } from "@/lib/utils/format";

type Params = { slug: string };

const LESSON_ICON: Record<OutlineLesson["type"], LucideIcon> = {
  video: PlayCircle,
  text: FileText,
  quiz: HelpCircle,
  assignment: ClipboardList,
  scorm: Package,
};

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseDetail(await createClient(), slug);
  if (!course) return { title: "Course not found" };

  const description = (course.subtitle ?? course.description).slice(0, 160);
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: { title: course.title, description, type: "website" },
  };
}

export default async function CourseDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const course = await getCourseDetail(supabase, slug);
  if (!course) notFound();
  const [reviews, { data: auth }] = await Promise.all([getCourseReviews(supabase, slug), supabase.auth.getUser()]);

  const level = LEVEL_OPTIONS.find((l) => l.value === course.level)?.label ?? course.level;
  const language =
    LANGUAGE_OPTIONS.find((l) => l.value === course.language)?.label ?? course.language;

  // Structured data for search engines. "<" is escaped so course text can never close the tag.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.subtitle ?? course.description.slice(0, 300),
    provider: { "@type": "Organization", name: "Modern LMS" },
    inLanguage: course.language,
    ...(course.ratingCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: course.ratingAvg,
        ratingCount: course.ratingCount,
      },
    }),
    offers: { "@type": "Offer", price: course.priceCents / 100, priceCurrency: course.currency },
  }).replace(/</g, "\\u003c");

  return (
    <article className="space-y-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-text-secondary">
        <Link href="/courses" className="hover:text-text hover:underline">
          Courses
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span aria-current="page" className="truncate text-text">
          {course.title}
        </span>
      </nav>

      <header className="max-w-3xl space-y-3">
        {course.categoryName && <Badge tone="primary">{course.categoryName}</Badge>}
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{course.title}</h1>
        {course.subtitle && <p className="text-lg text-text-secondary">{course.subtitle}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
          {course.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
              <span className="font-medium text-text">{course.ratingAvg.toFixed(1)}</span>
              <span>({course.ratingCount.toLocaleString("en-US")} ratings)</span>
            </span>
          ) : (
            <span>No ratings yet</span>
          )}
          {course.instructorName && <span>Taught by {course.instructorName}</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden="true" />
            {formatDuration(course.durationMinutes)}
          </span>
          <span>{level}</span>
          <span className="inline-flex items-center gap-1">
            <Globe className="size-4" aria-hidden="true" />
            {language}
          </span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          {course.outcomes.length > 0 && (
            <Card>
              <CardHeader title="What you will learn" />
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {course.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-2 text-sm">
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-success"
                        aria-hidden="true"
                      />
                      {o}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {descriptionParagraphs(course.description).length > 0 && (
            <section aria-labelledby="about-heading" className="space-y-3">
              <h2 id="about-heading" className="text-xl font-semibold">
                About this course
              </h2>
              {descriptionParagraphs(course.description).map((p) => (
                <p key={p} className="text-text-secondary">
                  {p}
                </p>
              ))}
            </section>
          )}

          <section aria-labelledby="curriculum-heading" className="space-y-3">
            <h2 id="curriculum-heading" className="text-xl font-semibold">
              Curriculum
            </h2>
            <p className="text-sm text-text-secondary">
              {course.sections.length} {course.sections.length === 1 ? "section" : "sections"} ·{" "}
              {course.lessonCount} {course.lessonCount === 1 ? "lesson" : "lessons"} ·{" "}
              {formatDuration(course.durationMinutes)} total
            </p>
            {course.sections.length === 0 ? (
              <p className="text-sm text-text-secondary">
                The curriculum has not been published yet.
              </p>
            ) : (
              <div className="space-y-3">
                {course.sections.map((section) => (
                  <details
                    key={section.id}
                    open
                    className="rounded-card border border-border bg-surface"
                  >
                    <summary className="cursor-pointer rounded-card px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-primary">
                      {section.title}
                      <span className="ml-2 text-sm font-normal text-text-secondary">
                        {section.lessons.length}{" "}
                        {section.lessons.length === 1 ? "lesson" : "lessons"}
                      </span>
                    </summary>
                    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                      {section.lessons.map((lesson) => {
                        const Icon = LESSON_ICON[lesson.type];
                        return (
                          <li
                            key={lesson.id}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm"
                          >
                            <Icon
                              className="size-4 shrink-0 text-text-secondary"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">{lesson.title}</span>
                            {lesson.isPreview && <Badge tone="info">Preview</Badge>}
                            <span className="shrink-0 text-text-secondary">
                              {formatDuration(lesson.durationMinutes)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </section>

          {course.prerequisites.length > 0 && (
            <section aria-labelledby="prereq-heading" className="space-y-3">
              <h2 id="prereq-heading" className="text-xl font-semibold">
                Prerequisite courses
              </h2>
              <p className="text-sm text-text-secondary">Complete these courses before you can enroll:</p>
              <ul className="list-disc space-y-1 pl-5">
                {course.prerequisites.map((p) => (
                  <li key={p.id}>{p.title}</li>
                ))}
              </ul>
            </section>
          )}

          {course.instructorName && (course.instructorHeadline || course.instructorBio) && (
            <section aria-labelledby="instructor-heading" className="space-y-2">
              <h2 id="instructor-heading" className="text-xl font-semibold">
                About the instructor
              </h2>
              <p className="font-medium">{course.instructorName}</p>
              {course.instructorHeadline && <p className="text-sm text-text-secondary">{course.instructorHeadline}</p>}
              {course.instructorBio && <p className="whitespace-pre-line text-sm text-text-secondary">{course.instructorBio}</p>}
            </section>
          )}

          {reviews && <CourseReviewsSection data={reviews} signedIn={Boolean(auth.user)} />}

          {course.requirements.length > 0 && (
            <section aria-labelledby="requirements-heading" className="space-y-3">
              <h2 id="requirements-heading" className="text-xl font-semibold">
                Requirements
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-text-secondary">
                {course.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label="Course summary" className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardContent className="space-y-4">
              <p className="text-3xl font-bold">
                {formatPrice(course.priceCents, course.currency)}
              </p>
              <EnrollmentPanel
                courseId={course.id}
                slug={course.slug}
                priceCents={course.priceCents}
              />
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <BookOpen className="size-4" aria-hidden="true" />
                  {course.lessonCount} lessons
                </li>
                <li className="flex items-center gap-2">
                  <Clock className="size-4" aria-hidden="true" />
                  {formatDuration(course.durationMinutes)} of content
                </li>
                {course.certificateEnabled && (
                  <li className="flex items-center gap-2">
                    <Award className="size-4" aria-hidden="true" />
                    Certificate of completion
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}
