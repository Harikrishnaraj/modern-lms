import type { SupabaseClient } from "@supabase/supabase-js";

export const ATTEMPTS_PAGE_SIZE = 25;

export interface AdminAssessmentAnalytics {
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  passMark: number;
  totalAttempts: number;
  totalLearners: number;
  passedAttempts: number;
  passRate: number;
  avgScore: number;
  avgAttempts: number;
}

interface AssessmentRow {
  assessment_id: string;
  assessment_title: string;
  course_id: string;
  course_title: string;
  pass_mark: number;
  total_attempts: number;
  total_learners: number;
  passed_attempts: number;
  pass_rate: number;
  avg_score: number;
  avg_attempts: number;
}

/** Platform-wide per-assessment averages. Requires course.read_all. */
export async function getAdminAssessmentAnalytics(
  supabase: SupabaseClient,
  courseId?: string,
): Promise<AdminAssessmentAnalytics[]> {
  const { data, error } = await supabase.rpc("admin_assessment_analytics", { p_course_id: courseId || null });
  if (error) throw new Error(`admin_assessment_analytics failed: ${error.message}`);
  return ((data ?? []) as AssessmentRow[]).map((r) => ({
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    passMark: r.pass_mark,
    totalAttempts: r.total_attempts,
    totalLearners: r.total_learners,
    passedAttempts: r.passed_attempts,
    passRate: r.pass_rate,
    avgScore: Number(r.avg_score),
    avgAttempts: Number(r.avg_attempts),
  }));
}

export type QuestionQualityFlag = "review_too_hard" | "review_too_easy" | null;

export interface AdminQuestionAnalytics {
  questionId: string;
  prompt: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  questionType: string;
  points: number;
  totalAttempts: number;
  passRate: number;
  difficulty: "easy" | "medium" | "hard";
  qualityFlag: QuestionQualityFlag;
}

interface QuestionRow {
  question_id: string;
  prompt: string;
  assessment_id: string;
  assessment_title: string;
  course_id: string;
  course_title: string;
  question_type: string;
  points: number;
  total_attempts: number;
  pass_rate: number;
  difficulty: "easy" | "medium" | "hard";
  quality_flag: QuestionQualityFlag;
}

/** Platform-wide per-question difficulty and quality flags. Requires course.read_all. */
export async function getAdminQuestionAnalytics(
  supabase: SupabaseClient,
  courseId?: string,
): Promise<AdminQuestionAnalytics[]> {
  const { data, error } = await supabase.rpc("admin_question_analytics", { p_course_id: courseId || null });
  if (error) throw new Error(`admin_question_analytics failed: ${error.message}`);
  return ((data ?? []) as QuestionRow[]).map((r) => ({
    questionId: r.question_id,
    prompt: r.prompt,
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    questionType: r.question_type,
    points: r.points,
    totalAttempts: r.total_attempts,
    passRate: r.pass_rate,
    difficulty: r.difficulty,
    qualityFlag: r.quality_flag,
  }));
}

export type AttemptStatus = "in_progress" | "submitted" | "graded";

export interface AdminAttempt {
  attemptId: string;
  userId: string;
  learnerName: string | null;
  learnerEmail: string | null;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  attemptNumber: number;
  status: AttemptStatus;
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  passed: boolean | null;
  startedAt: string;
  submittedAt: string | null;
}

interface AttemptRow {
  attempt_id: string;
  user_id: string;
  learner_name: string | null;
  learner_email: string | null;
  assessment_id: string;
  assessment_title: string;
  course_id: string;
  course_title: string;
  attempt_number: number;
  status: AttemptStatus;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
  started_at: string;
  submitted_at: string | null;
  total: number | string;
}

export interface AttemptQuery {
  q: string;
  courseId: string;
  status: AttemptStatus | "";
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseAttemptQuery(params: Params): AttemptQuery {
  const status = one(params.status);
  const courseId = one(params.courseId);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    courseId: UUID.test(courseId) ? courseId : "",
    status: status === "in_progress" || status === "submitted" || status === "graded" ? status : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

/** One page of attempts matching the search/filters (investigation view). Requires course.read_all. */
export async function searchAdminAttempts(
  supabase: SupabaseClient,
  query: AttemptQuery,
): Promise<{ attempts: AdminAttempt[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_search_attempts", {
    p_q: query.q,
    p_course_id: query.courseId || null,
    p_assessment_id: null,
    p_status: query.status,
    p_limit: ATTEMPTS_PAGE_SIZE,
    p_offset: (query.page - 1) * ATTEMPTS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_search_attempts failed: ${error.message}`);
  const rows = (data ?? []) as AttemptRow[];
  return {
    attempts: rows.map(mapAttempt),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

function mapAttempt(r: AttemptRow): AdminAttempt {
  return {
    attemptId: r.attempt_id,
    userId: r.user_id,
    learnerName: r.learner_name,
    learnerEmail: r.learner_email,
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    attemptNumber: r.attempt_number,
    status: r.status,
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
    percent: r.percent === null ? null : Number(r.percent),
    passed: r.passed,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
  };
}

export interface AdminAttemptDetail extends AdminAttempt {
  expiresAt: string | null;
  answers: Record<string, unknown>;
}

interface AttemptDetailRow {
  attempt_id: string;
  user_id: string;
  learner_name: string | null;
  learner_email: string | null;
  assessment_id: string;
  assessment_title: string;
  course_id: string;
  course_title: string;
  attempt_number: number;
  status: AttemptStatus;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
  answers: Record<string, unknown>;
}

/** Full detail for one attempt, including submitted answers. Requires course.read_all. */
export async function getAdminAttemptDetail(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<AdminAttemptDetail | null> {
  const { data, error } = await supabase.rpc("admin_attempt_detail", { p_attempt_id: attemptId });
  if (error) throw new Error(`admin_attempt_detail failed: ${error.message}`);
  const row = ((data ?? []) as AttemptDetailRow[])[0];
  if (!row) return null;
  return {
    ...mapAttempt({ ...row, total: 0 }),
    expiresAt: row.expires_at,
    answers: row.answers ?? {},
  };
}
