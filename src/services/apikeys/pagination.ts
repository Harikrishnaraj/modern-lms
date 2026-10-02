import type { NextRequest } from "next/server";

export const API_PAGE_SIZE = 50;

export function parsePage(request: NextRequest): number {
  const n = Number.parseInt(request.nextUrl.searchParams.get("page") ?? "", 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : 1;
}
