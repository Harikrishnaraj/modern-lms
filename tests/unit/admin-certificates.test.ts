import { describe, expect, it } from "vitest";
import { parseCertificateQuery } from "@/features/admin/certificates";

describe("parseCertificateQuery", () => {
  it("defaults to an empty query on page 1", () => {
    expect(parseCertificateQuery({})).toEqual({ q: "", status: "", courseId: "", page: 1 });
  });

  it("only accepts known status values", () => {
    expect(parseCertificateQuery({ status: "issued" }).status).toBe("issued");
    expect(parseCertificateQuery({ status: "revoked" }).status).toBe("revoked");
    expect(parseCertificateQuery({ status: "bogus" }).status).toBe("");
  });

  it("only accepts a UUID-shaped courseId", () => {
    expect(parseCertificateQuery({ courseId: "not-a-uuid" }).courseId).toBe("");
    expect(parseCertificateQuery({ courseId: "11111111-1111-1111-1111-111111111111" }).courseId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("clamps an invalid page number to 1", () => {
    expect(parseCertificateQuery({ page: "0" }).page).toBe(1);
    expect(parseCertificateQuery({ page: "abc" }).page).toBe(1);
    expect(parseCertificateQuery({ page: "3" }).page).toBe(3);
  });
});
