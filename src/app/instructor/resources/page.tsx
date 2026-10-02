import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FolderOpen } from "lucide-react";
import { getInstructorCourses } from "@/features/instructor/courses";
import { getResourceLibrary } from "@/features/instructor/resources";
import { createClient } from "@/lib/supabase/server";
import { RESOURCE_LIBRARY_BUCKET, supabaseStorage } from "@/services/storage";
import { formatFileSize } from "@/lib/utils/format";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ResourceAttachControl } from "@/components/instructor/resource-attach-control";
import { ResourceDeleteButton } from "@/components/instructor/resource-delete-button";
import { ResourceUploadForm } from "@/components/instructor/resource-upload-form";

export const metadata: Metadata = {
  title: "Resources | Instructor",
  description: "Your reusable media and documents.",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function InstructorResourcesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/instructor/resources");
  }

  const [resources, courses] = await Promise.all([getResourceLibrary(supabase), getInstructorCourses(supabase)]);
  const courseOptions = courses.map((c) => ({ id: c.courseId, title: c.title }));

  const resourcesWithUrls = await Promise.all(
    resources.map(async (r) => ({
      ...r,
      downloadUrl: await supabaseStorage.createSignedUrl(RESOURCE_LIBRARY_BUCKET, r.storagePath, 600).catch(() => null),
    })),
  );

  return (
    <>
      <PageHeader
        title="Resources"
        description="Upload media and documents once, then reuse them across any of your lessons."
      />

      <div className="mb-4">
        <ResourceUploadForm />
      </div>

      {resourcesWithUrls.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No resources yet"
          description="Upload a file to start building your reusable library."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {resourcesWithUrls.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{r.name}</h2>
                    <p className="text-sm text-text-secondary">
                      {r.sizeBytes != null ? formatFileSize(r.sizeBytes) : "Unknown size"} · Uploaded{" "}
                      {dateFormat.format(new Date(r.createdAt))}
                    </p>
                  </div>
                  <ResourceDeleteButton resourceId={r.id} />
                </div>

                <p className="text-sm text-text-secondary">
                  Used in {r.usageCount} {r.usageCount === 1 ? "lesson" : "lessons"}
                </p>

                {r.downloadUrl && (
                  <a
                    href={r.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Download
                  </a>
                )}

                <ResourceAttachControl resourceId={r.id} courses={courseOptions} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
