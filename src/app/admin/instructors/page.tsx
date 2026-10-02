import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, UserCog } from "lucide-react";
import { getAdminInstructors, getInstructorApplications } from "@/features/admin/instructors";
import { ApplicationReviewActions } from "@/components/admin/application-review-actions";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Instructors" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function AdminInstructorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "user.read_all"))) {
    return (
      <>
        <PageHeader title="Instructors" />
        <PermissionDeniedState title="You cannot view instructors" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [{ instructors }, applications, canManage] = await Promise.all([
    getAdminInstructors(supabase, { sort: "top" }),
    getInstructorApplications(supabase, "pending"),
    can(supabase, user.id, "user.manage"),
  ]);
  const topInstructors = instructors.slice(0, 5);

  return (
    <>
      <PageHeader title="Instructors" description={`${instructors.length} ${instructors.length === 1 ? "instructor" : "instructors"}`} />

      <Card className="mb-6">
        <CardHeader
          title="Verification queue"
          description={`${applications.length} application${applications.length === 1 ? "" : "s"} awaiting review.`}
        />
        <CardContent>
          {applications.length === 0 ? (
            <EmptyState icon={UserCog} title="Nothing to review" description="New instructor applications will appear here." />
          ) : (
            <ul aria-label="Applications awaiting review" className="divide-y divide-border-subtle">
              {applications.map((a) => (
                <li key={a.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{a.applicantName ?? a.applicantEmail ?? "Unknown"}</p>
                    <p className="text-xs text-text-secondary">{dateFormat.format(new Date(a.createdAt))}</p>
                  </div>
                  <p className="text-sm text-text-secondary">{a.message}</p>
                  {canManage && <ApplicationReviewActions applicationId={a.id} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Top instructors" description="Ranked by total learners across their courses." />
        <CardContent>
          {topInstructors.length === 0 ? (
            <EmptyState icon={Trophy} title="No instructors yet" description="Instructors appear here once they have at least one course." />
          ) : (
            <ol className="space-y-2">
              {topInstructors.map((i, idx) => (
                <li key={i.userId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-text-secondary">{idx + 1}.</span> {i.fullName ?? i.email ?? "Unknown"}
                  </span>
                  <span className="shrink-0 text-text-secondary">
                    {i.totalLearners} {i.totalLearners === 1 ? "learner" : "learners"} · {i.publishedCourseCount}{" "}
                    {i.publishedCourseCount === 1 ? "course" : "courses"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="All instructors" />
        <CardContent>
          {instructors.length === 0 ? (
            <EmptyState icon={UserCog} title="No instructors yet" description="Approve an application to see instructors here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary uppercase">
                  <tr>
                    <th scope="col" className="p-2">Instructor</th>
                    <th scope="col" className="p-2">Courses</th>
                    <th scope="col" className="p-2">Learners</th>
                    <th scope="col" className="p-2">Rating</th>
                    <th scope="col" className="p-2">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {instructors.map((i) => (
                    <tr key={i.userId}>
                      <td className="p-2">
                        <Link href={`/admin/instructors/${i.userId}`} className="font-medium hover:underline">
                          {i.fullName ?? i.email ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="p-2">
                        {i.publishedCourseCount}/{i.courseCount} published
                      </td>
                      <td className="p-2">{i.totalLearners}</td>
                      <td className="p-2">{i.ratingAvg > 0 ? i.ratingAvg.toFixed(1) : "—"}</td>
                      <td className="p-2">{dateFormat.format(new Date(i.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
