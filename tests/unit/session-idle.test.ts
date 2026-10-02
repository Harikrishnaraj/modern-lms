import { describe, expect, it } from "vitest";
import { isSessionIdleExpired } from "@/lib/permissions/session";

describe("isSessionIdleExpired", () => {
  const now = new Date("2026-01-01T12:00:00Z");

  it("never expires when no timeout is configured", () => {
    expect(isSessionIdleExpired(null, null, now)).toBe(false);
    expect(isSessionIdleExpired("2020-01-01T00:00:00Z", null, now)).toBe(false);
  });

  it("treats a missing timestamp as expired once a timeout is configured", () => {
    expect(isSessionIdleExpired(null, 15, now)).toBe(true);
  });

  it("treats an unparseable timestamp as expired", () => {
    expect(isSessionIdleExpired("not-a-date", 15, now)).toBe(true);
  });

  it("is not expired within the window", () => {
    const recent = new Date(now.getTime() - 5 * 60_000).toISOString();
    expect(isSessionIdleExpired(recent, 15, now)).toBe(false);
  });

  it("is expired past the window", () => {
    const stale = new Date(now.getTime() - 20 * 60_000).toISOString();
    expect(isSessionIdleExpired(stale, 15, now)).toBe(true);
  });

  it("is not expired exactly at the boundary", () => {
    const boundary = new Date(now.getTime() - 15 * 60_000).toISOString();
    expect(isSessionIdleExpired(boundary, 15, now)).toBe(false);
  });
});
