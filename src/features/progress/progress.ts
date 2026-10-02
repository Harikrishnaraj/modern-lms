import type { SupabaseClient } from "@supabase/supabase-js";

export interface CourseProgress {
  courseId: string;
  slug: string;
  title: string;
  category: string | null;
  status: "active" | "completed";
  totalLessons: number;
  completedLessons: number;
  minutes: number;
  percent: number;
}

export interface Skill {
  name: string;
  level: SkillLevel;
  completedCourses: number;
  completedLessons: number;
  minutes: number;
}

export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

export interface MyProgress {
  minutes: number;
  lessonsCompleted: number;
  /** Distinct UTC days with a completed lesson, newest first (YYYY-MM-DD). */
  activeDays: string[];
  courses: CourseProgress[];
}

interface ProgressPayload {
  minutes: number | string;
  lessons_completed: number | string;
  active_days: string[];
  courses: { course_id: string; slug: string; title: string; category: string | null; status: string; total_lessons: number; completed_lessons: number; minutes: number | string }[];
}

function parseProgress(d: ProgressPayload): MyProgress {
  return {
    minutes: Number(d.minutes),
    lessonsCompleted: Number(d.lessons_completed),
    activeDays: d.active_days,
    courses: d.courses.map((c) => ({
      courseId: c.course_id,
      slug: c.slug,
      title: c.title,
      category: c.category,
      status: c.status === "completed" ? "completed" : "active",
      totalLessons: Number(c.total_lessons),
      completedLessons: Number(c.completed_lessons),
      minutes: Number(c.minutes),
      percent: Number(c.total_lessons) === 0 ? 0 : Math.round((Number(c.completed_lessons) / Number(c.total_lessons)) * 100),
    })),
  };
}

/** The learner own progress, from real lesson completions (RPC is bound to the caller). */
export async function getMyProgress(supabase: SupabaseClient): Promise<MyProgress> {
  const { data, error } = await supabase.rpc("my_progress");
  if (error || !data) throw new Error(`my_progress failed: ${error?.message}`);
  return parseProgress(data as ProgressPayload);
}

/** An arbitrary user's progress (admin view; the RPC requires user.read_all). */
export async function getUserProgress(supabase: SupabaseClient, userId: string): Promise<MyProgress> {
  const { data, error } = await supabase.rpc("admin_user_progress", { p_user_id: userId });
  if (error || !data) throw new Error(`admin_user_progress failed: ${error?.message}`);
  return parseProgress(data as ProgressPayload);
}

// ---------------------------------------------------------------- pure logic

const DAY_MS = 86_400_000;
const dayNumber = (ymd: string) => Math.floor(new Date(`${ymd}T00:00:00Z`).getTime() / DAY_MS);

/**
 * Streaks over UTC days with activity. `current` counts back from today, and a streak that was
 * last active yesterday is still alive (today is not over yet). `longest` is the best run ever.
 */
export function computeStreaks(activeDays: string[], today: Date = new Date()): { current: number; longest: number } {
  const days = [...new Set(activeDays.map(dayNumber))].sort((a, b) => b - a);
  if (days.length === 0) return { current: 0, longest: 0 };
  const todayNumber = Math.floor(today.getTime() / DAY_MS);

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i - 1] - days[i] === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  let current = 0;
  if (days[0] >= todayNumber - 1) {
    current = 1;
    for (let i = 1; i < days.length && days[i - 1] - days[i] === 1; i++) current++;
  }
  return { current, longest };
}

/** Skill level from completed courses in a category: advanced needs 3, intermediate 1. */
export function skillLevel(completedCourses: number): SkillLevel {
  return completedCourses >= 3 ? "Advanced" : completedCourses >= 1 ? "Intermediate" : "Beginner";
}

/** Skills are the categories the learner has completed at least one lesson in, strongest first. */
export function deriveSkills(courses: CourseProgress[]): Skill[] {
  const byCategory = new Map<string, Skill>();
  for (const c of courses) {
    if (!c.category || c.completedLessons === 0) continue;
    const s = byCategory.get(c.category) ?? { name: c.category, level: "Beginner" as SkillLevel, completedCourses: 0, completedLessons: 0, minutes: 0 };
    s.completedLessons += c.completedLessons;
    s.minutes += c.minutes;
    if (c.status === "completed") s.completedCourses += 1;
    byCategory.set(c.category, s);
  }
  return [...byCategory.values()]
    .map((s) => ({ ...s, level: skillLevel(s.completedCourses) }))
    .sort((a, b) => b.completedCourses - a.completedCourses || b.minutes - a.minutes || a.name.localeCompare(b.name));
}

export function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** Days of the last `n` days (oldest first) and whether each had activity, for the activity strip. */
export function recentActivity(activeDays: string[], n: number, today: Date = new Date()): { day: string; active: boolean }[] {
  const set = new Set(activeDays);
  const out: { day: string; active: boolean }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(Math.floor(today.getTime() / DAY_MS) * DAY_MS - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, active: set.has(day) });
  }
  return out;
}
