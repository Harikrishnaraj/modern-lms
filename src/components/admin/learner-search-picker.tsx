"use client";

import { useId, useState, useTransition } from "react";
import { searchLearnersAction, type LearnerOption } from "@/features/admin/enrollment-actions";

export function LearnerSearchPicker({
  onSelect,
  selected,
  search = searchLearnersAction,
  placeholder = "Search learner by name or email…",
}: {
  onSelect: (learner: LearnerOption | null) => void;
  selected: LearnerOption | null;
  /** Defaults to learners only; pass a different search action for a broader picker (e.g. any user). */
  search?: (q: string) => Promise<LearnerOption[]>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LearnerOption[]>([]);
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
      setResults(await search(value));
    });
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-pill bg-primary-light px-2.5 py-1 text-primary-dark">
          {selected.fullName ?? selected.email}
        </span>
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
        Search learners
      </label>
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-control border border-border bg-surface shadow-md">
          {results.map((r) => (
            <li key={r.userId}>
              <button
                type="button"
                onClick={() => {
                  onSelect(r);
                  setResults([]);
                }}
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-surface-subtle"
              >
                {r.fullName ?? r.email}
                {r.fullName && <span className="ml-1 text-text-secondary">{r.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
