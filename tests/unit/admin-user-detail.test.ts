import { describe, expect, it } from "vitest";
import { describeUserAgent } from "@/features/admin/user-detail";

describe("describeUserAgent", () => {
  it("returns a placeholder for a missing user agent", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
  });

  it("identifies common browser/OS combinations", () => {
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on Windows");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on macOS");
    expect(
      describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"),
    ).toBe("Safari on iOS");
    expect(
      describeUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("Chrome on Android");
  });

  it("falls back to unknown for unrecognized fields", () => {
    expect(describeUserAgent("some-custom-client/1.0")).toBe("Unknown browser on Unknown OS");
  });
});
