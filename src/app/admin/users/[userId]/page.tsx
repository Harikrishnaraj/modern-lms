import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { getLoginHistory, getAdminUserDetail, describeUserAgent, LOGIN_HISTORY_LIMIT } from "@/features/admin/user-detail";
import { getUserProgress, deriveSkills, formatHours } from "@/features/progress/progress";
import { PermissionDeniedState, EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { UserRowActions } from "@/components/admin/user-row-actions";
import { ROLE_LABEL } from "@/features/admin/user-rules";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "User detail" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "user.read_all"))) {
    return (
      <>
        <PageHeader title="User detail" />
        <PermissionDeniedState title="You cannot view this user" description="Ask an administrator if you need access." />
      </>
    );
  }

  const target = await getAdminUserDetail(supabase, userId);
  if (!target) notFound();

  const [progress, loginHistory, canManage, { data: myRoles }] = await Promise.all([
    getUserProgress(supabase, userId),
    getLoginHistory(supabase, userId),
    can(supabase, user.id, "user.manage"),
    supabase.from("user_roles").select("role_id").eq("user_id", user.id),
  ]);
  const actorIsSuper = (myRoles ?? []).some((r) => r.role_id === "super_admin");
  const skills = deriveSkills(progress.courses);
  const completed = progress.courses.filter((c) => c.status === "completed").length;

  return (
    <>
      <PageHeader
        title={target.fullName ?? target.email ?? "User"}
        description={target.email && target.fullName ? target.email : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Progress" description="From real lesson completions." />
            <CardContent>
              {progress.courses.length === 0 ? (
                <p className="text-sm text-text-secondary">This user has not started any course yet.</p>
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold">{formatHours(progress.minutes)}</p>
                      <p className="text-xs text-text-secondary">Learning time</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{progress.lessonsCompleted}</p>
                      <p className="text-xs text-text-secondary">Lessons done</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">
                        {completed}/{progress.courses.length}
                      </p>
                      <p className="text-xs text-text-secondary">Courses done</p>
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {progress.courses.map((c) => (
                      <li key={c.courseId} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{c.title}</span>
                          <span className="shrink-0 text-text-secondary">
                            {c.completedLessons}/{c.totalLessons} · {c.percent}%
                          </span>
                        </div>
                        <Progress value={c.percent} label={`Progress in ${c.title}`} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Skills" description="By category, from completed courses." />
            <CardContent>
              {skills.length === 0 ? (
                <p className="text-sm text-text-secondary">No skills yet — none of this user&apos;s courses have a category.</p>
              ) : (
                <ul className="space-y-3">
                  {skills.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {s.completedCourses} {s.completedCourses === 1 ? "course" : "courses"} · {formatHours(s.minutes)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary-dark">{s.level}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Login history"
              description={`Last ${LOGIN_HISTORY_LIMIT} sign-ins. Live session/device lists are not available through the auth provider.`}
            />
            <CardContent>
              {loginHistory.length === 0 ? (
                <EmptyState icon={LogIn} title="No recorded sign-ins" description="Sign-ins are recorded going forward from when this was added." />
              ) : (
                <ul aria-label="Login history" className="divide-y divide-border-subtle">
                  {loginHistory.map((event) => (
                    <li key={event.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>{describeUserAgent(event.userAgent)}</span>
                      <span className="text-text-secondary">
                        {dateFormat.format(new Date(event.createdAt))} UTC{event.ipAddress ? ` · ${event.ipAddress}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Account" />
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Status</span>
                <StatusBadge kind="user" status={target.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Roles</span>
                <span>
                  {target.roles.length > 0
                    ? target.roles.map((r) => ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).join(", ")
                    : "None"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Joined</span>
                <span>{dateFormat.format(new Date(target.createdAt))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary">Last sign-in</span>
                <span>{target.lastSignInAt ? dateFormat.format(new Date(target.lastSignInAt)) : "Never"}</span>
              </div>
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader title="Actions" />
              <CardContent>
                <UserRowActions user={target} isSelf={target.userId === user.id} actorIsSuper={actorIsSuper} />
              </CardContent>
            </Card>
          )}

          <Link href="/admin/users" className="text-sm text-primary hover:underline">
            ← Back to all users
          </Link>
        </div>
      </div>
    </>
  );
}
