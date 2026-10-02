"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { FILE_TYPE_KEYS, FILE_TYPES, type FileTypeKey } from "@/features/assignments/rules";
import { cn } from "@/lib/utils/cn";

/** Which file types learners may submit: a dropdown of checkboxes; the summary lists the choice. */
export function FileTypePicker({
  value,
  onChange,
  disabled = false,
  error,
  label = "File Type",
}: {
  value: string[];
  onChange: (next: FileTypeKey[]) => void;
  disabled?: boolean;
  error?: string;
  label?: string;
}) {
  const id = useId();
  const chosen = FILE_TYPE_KEYS.filter((k) => value.includes(k));
  const summary = chosen.length === 0 ? "Choose file types" : chosen.map((k) => FILE_TYPES[k].label).join(", ");

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text">
        {label}
      </span>
      <details className={cn("group relative", disabled && "pointer-events-none opacity-60")}>
        <summary
          aria-labelledby={`${id}-label ${id}-summary`}
          className={cn(
            "flex h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-input border bg-surface px-3 text-sm text-text [&::-webkit-details-marker]:hidden",
            error ? "border-danger" : "border-border",
          )}
        >
          <span id={`${id}-summary`} className="truncate">
            {summary}
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-secondary group-open:rotate-180" aria-hidden="true" />
        </summary>
        <fieldset
          aria-labelledby={`${id}-label`}
          disabled={disabled}
          className="absolute z-20 mt-1 grid w-full grid-cols-2 gap-1 rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          {FILE_TYPE_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 rounded-control px-2 py-1 text-sm hover:bg-background">
              <input
                type="checkbox"
                className="size-4"
                checked={chosen.includes(k)}
                onChange={(e) => onChange(e.target.checked ? [...chosen, k] : chosen.filter((c) => c !== k))}
              />
              {FILE_TYPES[k].label}
            </label>
          ))}
        </fieldset>
      </details>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
