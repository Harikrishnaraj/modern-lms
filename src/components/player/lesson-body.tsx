import { Paperclip } from "lucide-react";
import { ResumableVideo } from "@/components/player/resumable-video";
import { ScormPlayer } from "@/components/player/scorm-player";
import type { PlayerLessonContent } from "@/features/player/data";
import type { AssetLink } from "@/features/player/media";
import { sanitizeLessonHtml } from "@/lib/sanitize";
import { formatFileSize } from "@/lib/utils/format";

/**
 * The lesson title, video, rich text and downloads. Shared by the learner player and the instructor
 * preview (F-208) so the preview can never drift from what learners see.
 */
export function LessonBody({
  lesson,
  videoSrc,
  savedPosition,
  onSavePosition,
  onScormCommit,
  assets,
}: {
  lesson: PlayerLessonContent;
  videoSrc: string | null;
  savedPosition: number;
  onSavePosition?: (seconds: number) => Promise<unknown>;
  onScormCommit?: (cmi: Record<string, string>) => Promise<unknown>;
  assets: AssetLink[];
}) {
  const safeHtml = sanitizeLessonHtml(lesson.content);
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">{lesson.title}</h1>

      {lesson.type === "video" && videoSrc && (
        <ResumableVideo src={videoSrc} savedPosition={savedPosition} onSavePosition={onSavePosition} />
      )}
      {lesson.type === "video" && !videoSrc && (
        <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
          The video for this lesson is not available yet.
        </p>
      )}

      {lesson.type === "scorm" && lesson.scormLaunchPath && lesson.scormToken && (
        <ScormPlayer lessonId={lesson.id} token={lesson.scormToken} launchPath={lesson.scormLaunchPath} onCommit={onScormCommit} />
      )}
      {lesson.type === "scorm" && !(lesson.scormLaunchPath && lesson.scormToken) && (
        <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
          The SCORM package for this lesson is not available yet.
        </p>
      )}

      {safeHtml.trim() !== "" && (
        <div
          className="prose-lesson space-y-3 text-text [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-border-subtle [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      )}

      {assets.length > 0 && (
        <section aria-labelledby="downloads-heading" className="space-y-2">
          <h2 id="downloads-heading" className="text-base font-semibold">
            Downloads
          </h2>
          <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface">
            {assets.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  download={a.name}
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 text-sm hover:bg-border-subtle"
                >
                  <Paperclip className="size-4 text-text-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {a.sizeBytes !== null && (
                    <span className="text-xs text-text-secondary">{formatFileSize(a.sizeBytes)}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
