import { beforeAll, describe, expect, it } from "vitest";
import { SCORM_TOKEN_TTL_SECONDS, signScormToken, verifyScormToken } from "@/services/scorm/token";
import { frameConfig } from "@/components/player/scorm-player";
import { HOST_FRAME_PATH, buildHostFrame } from "@/services/scorm/host-frame";
import { contentTypeFor } from "@/services/scorm/parse";
import { scormContentHost } from "@/proxy";

const USER = "f9321458-718f-4d70-b3f9-d8da79b2143b";
const LESSON = "0c44599c-979f-4516-93f3-05bb17532a04";
const OTHER_LESSON = "a72a72e9-8d91-4c95-868e-e99afe1c2ab3";
const NOW = Date.UTC(2026, 8, 28, 10, 15);

beforeAll(() => {
  // .env.local sets this to an empty string (not unset) when no live project is configured, and
  // vitest.config.ts's loadEnv() loads it verbatim -- `??=` only replaces null/undefined, so it
  // must be `||=` to also replace that empty string.
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
});

describe("SCORM asset token", () => {
  it("round-trips to the user it was issued to", () => {
    expect(verifyScormToken(signScormToken(USER, LESSON, NOW), LESSON, NOW)).toBe(USER);
  });

  it("is only valid for the lesson it was minted for", () => {
    expect(verifyScormToken(signScormToken(USER, LESSON, NOW), OTHER_LESSON, NOW)).toBeNull();
  });

  it("expires", () => {
    const token = signScormToken(USER, LESSON, NOW);
    expect(verifyScormToken(token, LESSON, NOW + (SCORM_TOKEN_TTL_SECONDS + 3600) * 1000)).toBeNull();
  });

  it("rejects forged, tampered and malformed tokens", () => {
    const token = signScormToken(USER, LESSON, NOW);
    const [u, exp, sig] = token.split(".");
    expect(verifyScormToken(`${u}.${Number(exp) + 3600}.${sig}`, LESSON, NOW)).toBeNull(); // extended expiry
    expect(verifyScormToken(`00000000-0000-4000-8000-000000000000.${exp}.${sig}`, LESSON, NOW)).toBeNull(); // other user
    expect(verifyScormToken(`${u}.${exp}.${sig.slice(0, -2)}xx`, LESSON, NOW)).toBeNull();
    for (const bad of ["", "abc", "a.b.c", `${u}.${exp}`, `${token}.extra`, "not-a-uuid.9999999999.sig"]) {
      expect(verifyScormToken(bad, LESSON, NOW)).toBeNull();
    }
  });

  it("stays identical within the hour so a re-render does not reload the running course", () => {
    expect(signScormToken(USER, LESSON, NOW)).toBe(signScormToken(USER, LESSON, NOW + 30 * 60 * 1000));
  });
});

describe("SCORM frame isolation", () => {
  it("uses a separate content origin with allow-same-origin", () => {
    expect(frameConfig("http://127.0.0.1:3000/", "http://localhost:3000")).toEqual({
      origin: "http://127.0.0.1:3000",
      sandbox: "allow-scripts allow-same-origin allow-modals",
    });
  });

  it("never grants allow-same-origin on the app's own origin, or without a valid content origin", () => {
    const strict = { origin: "", sandbox: "allow-scripts allow-modals" };
    expect(frameConfig("http://localhost:3000", "http://localhost:3000")).toEqual(strict);
    expect(frameConfig(undefined, "http://localhost:3000")).toEqual(strict);
    expect(frameConfig("", "http://localhost:3000")).toEqual(strict);
    expect(frameConfig("not a url", "http://localhost:3000")).toEqual(strict);
  });
});

describe("SCORM content host (proxy guard)", () => {
  it("is the content origin's host only when it differs from the app's", () => {
    expect(scormContentHost("http://127.0.0.1:3000", "http://localhost:3000")).toBe("127.0.0.1:3000");
    expect(scormContentHost("https://scorm.example.com/", "https://lms.example.com")).toBe("scorm.example.com");
    expect(scormContentHost("http://localhost:3000", "http://localhost:3000")).toBeNull(); // never block the app itself
    expect(scormContentHost(undefined, "http://localhost:3000")).toBeNull();
    expect(scormContentHost("not a url", "http://localhost:3000")).toBeNull();
  });
});

describe("SCORM host frame", () => {
  it("holds the API shim, loads the encoded launch file and relays child commits", () => {
    const html = buildHostFrame({ shim: "<script>window.API = {};</script>", launchPath: "story files/index lms.html" });
    expect(html).toContain("<script>window.API = {};</script>");
    expect(html).toContain('src="story%20files/index%20lms.html"');
    expect(html).toContain("e.source === sco.contentWindow");
    expect(HOST_FRAME_PATH).toBe("__lms_frame.html");
  });

  it("serves package files by extension, since storage returns HTML as text/plain", () => {
    expect(contentTypeFor("index_lms.html")).toBe("text/html");
    expect(contentTypeFor("lms/API.js")).toBe("application/javascript");
    expect(contentTypeFor("a/b.woff")).toBe("font/woff");
    expect(contentTypeFor("setup.exe")).toBeUndefined();
  });
});
