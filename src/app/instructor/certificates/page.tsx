import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award } from "lucide-react";
import { getInstructorCourses } from "@/features/instructor/courses";
import { getCertificateTemplate, getInstructorCertificates } from "@/features/instructor/certificates";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CertificateCourseSelect } from "@/components/instructor/certificate-course-select";
import { CertificateTemplateForm } from "@/components/instructor/certificate-template-form";

export const metadata: Metadata = {
  title: "Certificates | Instructor",
  description: "Certificates issued for your courses, and the template new certificates use.",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

interface Props {
  searchParams: Promise<{ course?: string | string[]; template?: string | string[] }>;
}

function firstParam(v: string | string[] | undefined): string | null {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() || null;
}

export default async function InstructorCertificatesPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/instructor/certificates");
  }

  const resolvedParams = await searchParams;
  const listCourseId = firstParam(resolvedParams.course);

  const courses = await getInstructorCourses(supabase);

  if (courses.length === 0) {
    return (
      <>
        <PageHeader
          title="Certificates"
          description="Certificates issued for your courses, and the template new certificates use."
        />
        <EmptyState
          icon={Award}
          title="No courses yet"
          description="Certificates and their templates appear here once you have a published course with a certificate-earning learner."
          action={
            <Link href="/instructor/courses/new" className={buttonClasses()}>
              Create a course
            </Link>
          }
        />
      </>
    );
  }

  const templateCourseId = firstParam(resolvedParams.template) ?? courses[0].courseId;
  const selectedTemplateCourse = courses.find((c) => c.courseId === templateCourseId) ?? courses[0];

  const [certificates, template] = await Promise.all([
    getInstructorCertificates(supabase, listCourseId),
    getCertificateTemplate(supabase, selectedTemplateCourse.courseId),
  ]);

  const courseOptions = courses.map((c) => ({ id: c.courseId, title: c.title }));

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Certificates issued for your courses, and the template new certificates use."
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Issued certificates</h2>
          <CertificateCourseSelect
            courses={courseOptions}
            paramName="course"
            value={listCourseId}
            allowAll
            label="Course:"
          />
        </div>

        {certificates.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No certificates issued yet"
            description="Certificates appear here once a learner completes a certificate-earning course."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {certificates.map((c) => (
              <li key={c.id}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{c.learnerName}</h3>
                      <p className="text-sm text-text-secondary">{c.courseTitle}</p>
                    </div>
                    {c.status === "revoked" ? (
                      <Badge tone="danger" dot>
                        Revoked
                      </Badge>
                    ) : (
                      <Badge tone="success" dot>
                        Valid
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary">Issued {dateFormat.format(new Date(c.issuedAt))}</p>
                  <p className="text-sm">
                    <span className="text-text-secondary">Certificate ID: </span>
                    <code className="font-mono">{c.code}</code>
                  </p>
                  <Link
                    href={`/certificates/verify/${c.code}`}
                    className={buttonClasses({ size: "sm", className: "mt-auto self-start" })}
                  >
                    View certificate
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Certificate template</h2>
          <CertificateCourseSelect
            courses={courseOptions}
            paramName="template"
            value={selectedTemplateCourse.courseId}
            label="Course:"
          />
        </div>
        <Card className="p-5">
          <CertificateTemplateForm courseId={selectedTemplateCourse.courseId} template={template} />
        </Card>
      </section>
    </>
  );
}
