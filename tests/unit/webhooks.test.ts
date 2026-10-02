import { describe, expect, it } from "vitest";
import { generateWebhookSecret, isSafeWebhookUrl, isWebhookEvent, signWebhookPayload } from "@/services/webhooks";

describe("generateWebhookSecret", () => {
  it("produces distinct secrets with the expected prefix", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("signWebhookPayload", () => {
  it("is deterministic for the same secret and payload", () => {
    const sig = signWebhookPayload("secret", '{"a":1}');
    expect(sig).toBe(signWebhookPayload("secret", '{"a":1}'));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs when the secret or payload changes", () => {
    const base = signWebhookPayload("secret", '{"a":1}');
    expect(signWebhookPayload("other-secret", '{"a":1}')).not.toBe(base);
    expect(signWebhookPayload("secret", '{"a":2}')).not.toBe(base);
  });
});

describe("isWebhookEvent", () => {
  it("accepts the curated events and rejects anything else", () => {
    expect(isWebhookEvent("enrollment.created")).toBe(true);
    expect(isWebhookEvent("course.completed")).toBe(true);
    expect(isWebhookEvent("certificate.issued")).toBe(true);
    expect(isWebhookEvent("review.posted")).toBe(false);
  });
});

describe("isSafeWebhookUrl", () => {
  it("accepts a normal https URL", () => {
    expect(isSafeWebhookUrl("https://example.com/hook")).toBe(true);
  });

  it("rejects non-https URLs", () => {
    expect(isSafeWebhookUrl("http://example.com/hook")).toBe(false);
    expect(isSafeWebhookUrl("ftp://example.com/hook")).toBe(false);
  });

  it("rejects an unparseable URL", () => {
    expect(isSafeWebhookUrl("not a url")).toBe(false);
  });

  it("rejects localhost and loopback addresses", () => {
    expect(isSafeWebhookUrl("https://localhost/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://[::1]/hook")).toBe(false);
  });

  it("rejects private IPv4 ranges", () => {
    expect(isSafeWebhookUrl("https://10.0.0.5/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://192.168.1.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://172.16.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("https://169.254.1.1/hook")).toBe(false);
  });

  it("does not falsely reject a public IP that merely looks similar", () => {
    expect(isSafeWebhookUrl("https://172.32.0.1/hook")).toBe(true);
    expect(isSafeWebhookUrl("https://8.8.8.8/hook")).toBe(true);
  });
});
