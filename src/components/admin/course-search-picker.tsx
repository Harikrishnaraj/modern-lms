"use client";

import { useId, useState, useTransition } from "react";
import type { CourseOption } from "@/features/admin/assigned-learning-actions";
import { searchPublishedCoursesAction } from "@/features/admin/assigned-learning-actions";

export function CourseSearchPicker({ onSelect, selected }: { onSelect: (course: CourseOption | null) => void; selected: CourseOption | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseOption[]>([]);
  const [, startTransition] = useTransition();
  const inputId = useId();

  function onChange(value: string) {
    setQuery(value);
    if (selected) onSelect(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      setResults(await searchPublishedCoursesAction(value));
    });
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-pill bg-primary-light px-2.5 py-1 text-primary-dark">{selected.title}</span>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            setQuery("");
          }}
          className="text-xs text-text-secondary hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Search courses
      </label>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search published courses…"
        className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-control border border-border bg-surface shadow-md">
          {results.map((r) => (
            <li key={r.courseId}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setResults([]);
                }}
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-surface-subtle"
              >
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
