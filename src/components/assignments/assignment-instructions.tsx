import { instructionsToHtml, looksLikeHtml } from "@/features/assignments/hub-rules";
import { sanitizeLessonHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils/cn";

/**
 * Assignment instructions: rich text (T-114) is sanitized again on render; older plain-text
 * instructions are escaped into paragraphs first.
 */
export function AssignmentInstructions({ text, className }: { text: string; className?: string }) {
  const html = sanitizeLessonHtml(looksLikeHtml(text) ? text : instructionsToHtml(text));
  return (
    <div
      className={cn(
        "space-y-2 text-sm text-text [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h2]:text-base [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
