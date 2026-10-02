"use client";

import { useId, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface CourseOption {
  id: string;
  title: string;
}

/** Navigates by updating one query param, letting the server component re-fetch for it. */
export function CertificateCourseSelect({
  courses,
  paramName,
  value,
  allowAll,
  label,
}: {
  courses: CourseOption[];
  paramName: string;
  value: string | null;
  allowAll?: boolean;
  label: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectId = useId();
  const [, startTransition] = useTransition();

  const onChange = (next: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "all") {
      params.delete(paramName);
    } else {
      params.set(paramName, next);
    }
    startTransition(() => {
      router.push(`/instructor/certificates?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={selectId} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <select
        id={selectId}
        value={value ?? "all"}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {allowAll && <option value="all">All courses</option>}
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  );
}
