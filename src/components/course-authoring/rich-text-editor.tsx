"use client";

import { useRef } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, Underline } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TOOLS: Record<RichTextTool, { label: string; icon: typeof Bold; command: string; value?: string }> = {
  bold: { label: "Bold", icon: Bold, command: "bold" },
  italic: { label: "Italic", icon: Italic, command: "italic" },
  underline: { label: "Underline", icon: Underline, command: "underline" },
  heading: { label: "Heading", icon: Heading2, command: "formatBlock", value: "h2" },
  ul: { label: "Bulleted list", icon: List, command: "insertUnorderedList" },
  ol: { label: "Numbered list", icon: ListOrdered, command: "insertOrderedList" },
  quote: { label: "Quote", icon: Quote, command: "formatBlock", value: "blockquote" },
  link: { label: "Link", icon: Link2, command: "createLink" },
};

const btn =
  "inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text focus-visible:outline-2 focus-visible:outline-primary";

export type RichTextTool = "bold" | "italic" | "underline" | "heading" | "ul" | "ol" | "quote" | "link";
const DEFAULT_TOOLS: RichTextTool[] = ["bold", "italic", "heading", "ul", "ol", "quote", "link"];

/**
 * Small contentEditable rich-text editor (bold, italic, underline, heading, lists, quote, link). It only
 * produces markup; the server sanitizes on save and again on render, so nothing here is trusted.
 * `initialHtml` is applied once; the editor owns its content afterwards.
 */
export function RichTextEditor({
  initialHtml,
  onChange,
  disabled = false,
  label = "Lesson content",
  tools = DEFAULT_TOOLS,
  minHeight = "min-h-48",
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  label?: string;
  /** Which toolbar buttons to show, in order. */
  tools?: RichTextTool[];
  minHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function exec(command: string, value?: string) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false, value);
    onChange(ref.current?.innerHTML ?? "");
  }

  function addLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    try {
      if (new URL(url).protocol === "https:" || new URL(url).protocol === "http:") exec("createLink", url);
    } catch {
      /* ignore invalid URLs */
    }
  }

  return (
    <div className={cn("rounded-input border border-border bg-surface", disabled && "opacity-60")}>
      {/* mousedown is cancelled so clicking a button never steals focus or collapses the selection */}
      <div
        role="toolbar"
        aria-label="Formatting"
        onMouseDown={(e) => e.preventDefault()}
        className="flex flex-wrap gap-0.5 border-b border-border p-1"
      >
        {tools.map((t) => {
          const tool = TOOLS[t];
          const Icon = tool.icon;
          return (
            <button
              key={t}
              type="button"
              className={btn}
              aria-label={tool.label}
              onClick={() => (t === "link" ? addLink() : exec(tool.command, tool.value))}
              disabled={disabled}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable={!disabled}
        suppressContentEditableWarning
        // New lines become <p>, not <div> (which the sanitizer would flatten).
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        onPaste={(e) => {
          // Paste as plain text: no foreign styles or markup ever enter the editor.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className={cn(minHeight, "space-y-2 p-3 text-sm focus-visible:outline-2 focus-visible:outline-primary [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6")}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
    </div>
  );
}
