import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Server Actions call the rate limiter (needs request headers + a live DB);
// default it to "allowed". tests/unit/rate-limit.test.ts unmocks it.
vi.mock("@/services/rate-limit", () => ({
  RATE_LIMITED_MESSAGE: "Too many attempts. Please wait a while and try again.",
  clientIp: vi.fn(async () => "1.2.3.4"),
  userAgent: vi.fn(async () => "test-agent"),
  rateLimit: vi.fn(async () => true),
}));

// Supabase Auth rate-limits password sign-ins per IP. The live-project integration suite makes
// more sign-ins than one window allows, so wait and retry instead of failing the test.
// Only test setup uses this; app code is untouched.
import { GoTrueClient } from "@supabase/auth-js";

const original = GoTrueClient.prototype.signInWithPassword;
GoTrueClient.prototype.signInWithPassword = async function patched(
  this: InstanceType<typeof GoTrueClient>,
  credentials: Parameters<typeof original>[0],
) {
  let result = await original.call(this, credentials);
  for (let attempt = 0; attempt < 30 && result.error?.message?.toLowerCase().includes("rate limit"); attempt++) {
    await new Promise((r) => setTimeout(r, 10_000));
    result = await original.call(this, credentials);
  }
  return result;
} as typeof original;
