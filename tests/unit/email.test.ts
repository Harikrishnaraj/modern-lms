import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send } };
  }),
}));

import { sendEmail } from "@/services/email";

describe("sendEmail (T-141)", () => {
  const original = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };

  beforeEach(() => {
    send.mockReset();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "announcements@example.com";
  });
  afterEach(() => {
    process.env.RESEND_API_KEY = original.key;
    process.env.RESEND_FROM_EMAIL = original.from;
  });

  it("returns ok:false without calling Resend when the provider is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(result).toEqual({ ok: false, error: expect.stringContaining("not configured") });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns ok:true with the message id on a successful send", async () => {
    send.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(send).toHaveBeenCalledWith({ from: "announcements@example.com", to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
  });

  it("returns ok:false with the provider's error message when Resend rejects the send", async () => {
    send.mockResolvedValue({ data: null, error: { message: "invalid recipient" } });
    const result = await sendEmail({ to: "bad", subject: "Hi", html: "<p>hi</p>" });
    expect(result).toEqual({ ok: false, error: "invalid recipient" });
  });

  it("never throws even if the SDK call itself throws", async () => {
    send.mockRejectedValue(new Error("network down"));
    const result = await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" });
    expect(result).toEqual({ ok: false, error: "network down" });
  });
});
