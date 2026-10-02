import type { SupabaseClient } from "@supabase/supabase-js";
import { searchCourses, type CourseCardData } from "@/features/catalog/search-courses";
import { parseCatalogFilters } from "@/features/catalog/filters";
import { isUpcoming, listMyAssessments } from "@/features/assessments/list";
import { getMyLearning, splitLearning, type LearningItem } from "@/features/my-learning/queries";
import { getPlayerCourse } from "@/features/player/data";
import { resumeLessonId } from "@/features/player/navigation";
import { greetingName, interestSlugs, pickRecommendations, startOfUtcDay } from "./logic";

export interface NextUp {
  courseSlug: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonType: string;
  minutes: number;
}

export interface UpcomingAssessment {
  id: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  inProgress: boolean;
}

export interface DashboardData {
  name: string;
  continueLearning: LearningItem | null;
  inProgressCount: number;
  completedToday: number;
  nextUp: NextUp[];
  upcomingAssessments: UpcomingAssessment[];
  recommendations: CourseCardData[];
}

const NEXT_UP_LIMIT = 3;
const ASSESSMENT_LIMIT = 3;
const RECOMMENDATION_LIMIT = 3;

export async function getDashboardData(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<DashboardData> {
  const [{ data: profile }, { data: onboarding }, learning] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("learner_onboarding").select("interests").eq("user_id", user.id).maybeSingle(),
    getMyLearning(supabase),
  ]);

  const { inProgress } = splitLearning(learning);
  const continueLearning = inProgress[0] ?? null; // my_learning is ordered by recent activity

  const enrollmentIds = learning.map((l) => l.enrollmentId);

  // Independent of each other, so fetched concurrently rather than one round trip at a time
  // (T-246: dashboard query count).
  const [nextUpCourses, completedTodayResult, upcomingAssessments, recommendations] = await Promise.all([
    Promise.all(inProgress.slice(0, NEXT_UP_LIMIT).map((item) => getPlayerCourse(supabase, user.id, item.slug))),
    enrollmentIds.length
      ? supabase
          .from("lesson_progress")
          .select("id", { count: "exact", head: true })
          .in("enrollment_id", enrollmentIds)
          .gte("completed_at", startOfUtcDay(new Date()))
      : Promise.resolve({ count: 0 }),
    loadUpcomingAssessments(supabase, user.id),
    loadRecommendations(supabase, interestSlugs(onboarding?.interests), new Set(learning.map((l) => l.courseId))),
  ]);

  // Today's learning: the next unfinished lesson of each in-progress course.
  const nextUp: NextUp[] = [];
  nextUpCourses.forEach((course, i) => {
    if (!course?.enrolled) return;
    const item = inProgress[i];
    const lessonId = resumeLessonId(course.sections, course.completedLessonIds);
    const lesson = course.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
    if (lesson) {
      nextUp.push({
        courseSlug: item.slug,
        courseTitle: item.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonType: lesson.type,
        minutes: lesson.durationMinutes,
      });
    }
  });

  return {
    name: greetingName(profile?.full_name as string | null, user.email),
    continueLearning,
    inProgressCount: inProgress.length,
    completedToday: completedTodayResult.count ?? 0,
    nextUp,
    upcomingAssessments,
    recommendations,
  };
}

async function loadUpcomingAssessments(
  supabase: SupabaseClient,
  userId: string,
): Promise<UpcomingAssessment[]> {
  const all = await listMyAssessments(supabase, userId);
  return all
    .filter((a) => isUpcoming(a.status))
    .sort((x, y) => Number(y.status === "in_progress") - Number(x.status === "in_progress"))
    .slice(0, ASSESSMENT_LIMIT)
    .map((a) => ({
      id: a.id,
      title: a.title,
      courseSlug: a.courseSlug,
      courseTitle: a.courseTitle,
      inProgress: a.status === "in_progress",
    }));
}

async function loadRecommendations(
  supabase: SupabaseClient,
  interests: string[],
  owned: ReadonlySet<string>,
): Promise<CourseCardData[]> {
  const base = parseCatalogFilters({ sort: "top_rated" });
  // Interest slugs that match a catalog category get their own list; the rest fall back to
  // the overall top-rated list so everyone gets suggestions.
  const lists = await Promise.all(
    [...interests, null].map(async (slug) => {
      const page = await searchCourses(supabase, { ...base, category: slug });
      return page.courses;
    }),
  );
  return pickRecommendations(lists, owned, RECOMMENDATION_LIMIT);
}
