import { describe, expect, it } from "vitest";
import { extractBearerKey, generateApiKey, hashApiKey, isApiScope } from "@/services/apikeys";

describe("generateApiKey", () => {
  it("produces a plaintext key, a matching hash, and a prefix that is a substring of the plaintext", () => {
    const key = generateApiKey();
    expect(key.plaintext.startsWith("mlms_live_")).toBe(true);
    expect(key.plaintext.startsWith(key.prefix)).toBe(true);
    expect(hashApiKey(key.plaintext)).toBe(key.hash);
  });

  it("generates distinct keys each time", () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });
});

describe("hashApiKey", () => {
  it("is deterministic and produces a 64-char hex sha256 digest", () => {
    const hash = hashApiKey("some-key");
    expect(hash).toBe(hashApiKey("some-key"));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isApiScope", () => {
  it("accepts known scopes and rejects unknown ones", () => {
    expect(isApiScope("courses:read")).toBe(true);
    expect(isApiScope("courses:write")).toBe(false);
  });
});

describe("extractBearerKey", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerKey("Bearer abc123")).toBe("abc123");
  });

  it("returns null for a missing or malformed header", () => {
    expect(extractBearerKey(null)).toBeNull();
    expect(extractBearerKey("")).toBeNull();
    expect(extractBearerKey("Basic abc123")).toBeNull();
    expect(extractBearerKey("Bearer")).toBeNull();
  });
});
