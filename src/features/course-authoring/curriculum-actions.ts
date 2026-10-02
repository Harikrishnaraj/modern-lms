"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCourseForEditing } from "./queries";
import { isPermutation, nextPosition } from "./ordering";

export type CurriculumResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const titleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title.")
  .max(200, "Keep the title under 200 characters.");
const typeSchema = z.enum(["video", "text", "quiz", "assignment", "scorm"]);

const DENIED: CurriculumResult = { ok: false, error: "This course is not available." };
const LOCKED: CurriculumResult = {
  ok: false,
  error: "This course is locked while it is in review or published.",
};
const FAILED: CurriculumResult = { ok: false, error: "We could not save that change. Please try again." };

type Db = Awaited<ReturnType<typeof createClient>>;

// Every mutation goes through this: authenticate, prove ownership, and require the newest
// version to be editable. RLS (owner + editable version) then backs it up in the database.
type AuthContext =
  | { ok: true; supabase: Db; versionId: string; courseId: string }
  | { ok: false; result: CurriculumResult };

async function authorize(courseId: string): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { ok: false, error: "Please log in again." } };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, result: DENIED };
  if (!course.editable) return { ok: false, result: LOCKED };
  return { ok: true, supabase, versionId: course.version.id, courseId: course.courseId };
}

const done = (courseId: string): CurriculumResult => {
  revalidatePath(`/instructor/courses/${courseId}/curriculum`);
  revalidatePath("/instructor/courses");
  return { ok: true };
};

async function sectionIds(db: Db, versionId: string) {
  const { data } = await db.from("course_sections").select("id, position").eq("version_id", versionId).order("position");
  return data ?? [];
}

async function ownSection(db: Db, versionId: string, sectionId: string) {
  if (!UUID.test(sectionId)) return false;
  const { data } = await db.from("course_sections").select("id").eq("id", sectionId).eq("version_id", versionId).maybeSingle();
  return Boolean(data);
}

async function ownLesson(db: Db, versionId: string, lessonId: string) {
  if (!UUID.test(lessonId)) return null;
  const { data } = await db
    .from("lessons")
    .select("id, section_id, course_sections!inner(version_id)")
    .eq("id", lessonId)
    .eq("course_sections.version_id", versionId)
    .maybeSingle();
  return data ? { id: data.id as string, sectionId: data.section_id as string } : null;
}

async function lessonRows(db: Db, sectionId: string) {
  const { data } = await db.from("lessons").select("id, position").eq("section_id", sectionId).order("position");
  return data ?? [];
}

/** Rewrites positions 0..n-1 for the given ids in order. */
async function writePositions(db: Db, table: "course_sections" | "lessons", ids: string[]) {
  const results = await Promise.all(ids.map((id, position) => db.from(table).update({ position }).eq("id", id)));
  return results.every((r) => !r.error);
}

// ------------------------------------------------------------------ sections

export async function addSection(courseId: string, title: string): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await sectionIds(ctx.supabase, ctx.versionId);
  const { error } = await ctx.supabase.from("course_sections").insert({
    version_id: ctx.versionId,
    title: parsed.data,
    position: nextPosition(existing.map((s) => s.position as number)),
  });
  return error ? FAILED : done(ctx.courseId);
}

export async function renameSection(courseId: string, sectionId: string, title: string): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await ownSection(ctx.supabase, ctx.versionId, sectionId))) return DENIED;

  const { error } = await ctx.supabase.from("course_sections").update({ title: parsed.data }).eq("id", sectionId);
  return error ? FAILED : done(ctx.courseId);
}

export async function deleteSection(courseId: string, sectionId: string): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownSection(ctx.supabase, ctx.versionId, sectionId))) return DENIED;

  const { error } = await ctx.supabase.from("course_sections").delete().eq("id", sectionId);
  if (error) return FAILED;
  const rest = await sectionIds(ctx.supabase, ctx.versionId);
  await writePositions(ctx.supabase, "course_sections", rest.map((s) => s.id as string));
  return done(ctx.courseId);
}

/** Saves a complete new order of the sections (drag & drop or move up/down). */
export async function reorderSections(courseId: string, orderedIds: string[]): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const current = (await sectionIds(ctx.supabase, ctx.versionId)).map((s) => s.id as string);
  if (!Array.isArray(orderedIds) || !isPermutation(current, orderedIds)) {
    return { ok: false, error: "The curriculum changed elsewhere. Refresh and try again." };
  }
  return (await writePositions(ctx.supabase, "course_sections", orderedIds)) ? done(ctx.courseId) : FAILED;
}

// ------------------------------------------------------------------- lessons

export async function addLesson(
  courseId: string,
  sectionId: string,
  input: { title: string; type: string },
): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const title = titleSchema.safeParse(input?.title);
  if (!title.success) return { ok: false, error: title.error.issues[0].message };
  const type = typeSchema.safeParse(input?.type);
  if (!type.success) return { ok: false, error: "Choose a lesson type." };
  if (!(await ownSection(ctx.supabase, ctx.versionId, sectionId))) return DENIED;

  const rows = await lessonRows(ctx.supabase, sectionId);
  const { error } = await ctx.supabase.from("lessons").insert({
    section_id: sectionId,
    title: title.data,
    type: type.data,
    position: nextPosition(rows.map((l) => l.position as number)),
  });
  return error ? FAILED : done(ctx.courseId);
}

export async function renameLesson(courseId: string, lessonId: string, title: string): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const parsed = titleSchema.safeParse(title);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await ownLesson(ctx.supabase, ctx.versionId, lessonId))) return DENIED;

  const { error } = await ctx.supabase.from("lessons").update({ title: parsed.data }).eq("id", lessonId);
  return error ? FAILED : done(ctx.courseId);
}

export async function deleteLesson(courseId: string, lessonId: string): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const lesson = await ownLesson(ctx.supabase, ctx.versionId, lessonId);
  if (!lesson) return DENIED;

  const { error } = await ctx.supabase.from("lessons").delete().eq("id", lessonId);
  if (error) return FAILED;
  const rest = await lessonRows(ctx.supabase, lesson.sectionId);
  await writePositions(ctx.supabase, "lessons", rest.map((l) => l.id as string));
  return done(ctx.courseId);
}

/** Saves a complete new order of one section lessons. */
export async function reorderLessons(courseId: string, sectionId: string, orderedIds: string[]): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownSection(ctx.supabase, ctx.versionId, sectionId))) return DENIED;
  const current = (await lessonRows(ctx.supabase, sectionId)).map((l) => l.id as string);
  if (!Array.isArray(orderedIds) || !isPermutation(current, orderedIds)) {
    return { ok: false, error: "The curriculum changed elsewhere. Refresh and try again." };
  }
  return (await writePositions(ctx.supabase, "lessons", orderedIds)) ? done(ctx.courseId) : FAILED;
}

/** Moves a lesson to the end of another section of the same course version (menu alternative). */
export async function moveLessonToSection(
  courseId: string,
  lessonId: string,
  targetSectionId: string,
): Promise<CurriculumResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const lesson = await ownLesson(ctx.supabase, ctx.versionId, lessonId);
  if (!lesson || !(await ownSection(ctx.supabase, ctx.versionId, targetSectionId))) return DENIED;
  if (lesson.sectionId === targetSectionId) return done(ctx.courseId);

  const target = await lessonRows(ctx.supabase, targetSectionId);
  const { error } = await ctx.supabase
    .from("lessons")
    .update({ section_id: targetSectionId, position: nextPosition(target.map((l) => l.position as number)) })
    .eq("id", lessonId);
  if (error) return FAILED;
  const source = await lessonRows(ctx.supabase, lesson.sectionId);
  await writePositions(ctx.supabase, "lessons", source.map((l) => l.id as string));
  return done(ctx.courseId);
}
