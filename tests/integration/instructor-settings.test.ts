import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePayoutDetailsAction, updatePublicProfileAction } from "@/features/instructor/settings-actions";
import { getPayoutDetails, getPublicProfile } from "@/features/instructor/settings";
import { getCourseDetail } from "@/features/catalog/course-detail";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-220: Instructor settings — public profile, payout details (T-112), live Supabase.
describe.skipIf(!hasLiveProject)("instructor settings (T-112, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("insettings");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, { fullName });
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    owner = await user("own", "instructor", `${tag} Owner`);
    other = await user("other", "instructor", `${tag} Other`);
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
    });
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }), 120_000);

  it("published course detail has no instructor headline/bio before either is set", async () => {
    const detail = await getCourseDetail(anon(), `${tag}-course`);
    expect(detail?.instructorHeadline).toBeNull();
    expect(detail?.instructorBio).toBeNull();
  });

  it("lets the instructor save their own public profile, visible on their published course", async () => {
    currentClient = owner.client;
    const res = await updatePublicProfileAction({ headline: "Lead Instructor", bio: "I teach cloud systems." });
    expect(res).toEqual({ ok: true });

    const profile = await getPublicProfile(owner.client, owner.id);
    expect(profile).toEqual({ headline: "Lead Instructor", bio: "I teach cloud systems." });

    const detail = await getCourseDetail(anon(), `${tag}-course`);
    expect(detail?.instructorHeadline).toBe("Lead Instructor");
    expect(detail?.instructorBio).toBe("I teach cloud systems.");
  });

  it("rejects a headline or bio over the length limit", async () => {
    currentClient = owner.client;
    const tooLong = await updatePublicProfileAction({ headline: "x".repeat(151), bio: "" });
    expect(tooLong.ok).toBe(false);
  });

  it("cannot update another instructor's public profile directly (RLS own-row only)", async () => {
    const { error } = await other.client.from("profiles").update({ headline: "Hijacked" }).eq("id", owner.id);
    // Either rejected outright, or silently affects zero rows under RLS.
    const { data: unaffected } = await svc.from("profiles").select("headline").eq("id", owner.id).single();
    expect(error !== null || unaffected!.headline !== "Hijacked").toBe(true);
  });

  it("lets the instructor save and read back their own payout details", async () => {
    currentClient = owner.client;
    const res = await updatePayoutDetailsAction({ method: "paypal", reference: "owner@example.com" });
    expect(res).toEqual({ ok: true });

    const details = await getPayoutDetails(owner.client, owner.id);
    expect(details).toMatchObject({ payoutMethod: "paypal", payoutReference: "owner@example.com" });

    // Saving again replaces the previous value (upsert).
    const res2 = await updatePayoutDetailsAction({ method: "bank_transfer", reference: "IBAN ref 123" });
    expect(res2).toEqual({ ok: true });
    const updated = await getPayoutDetails(owner.client, owner.id);
    expect(updated).toMatchObject({ payoutMethod: "bank_transfer", payoutReference: "IBAN ref 123" });
  });

  it("rejects an invalid payout method or a blank reference", async () => {
    currentClient = owner.client;
    expect((await updatePayoutDetailsAction({ method: "crypto", reference: "x" })).ok).toBe(false);
    expect((await updatePayoutDetailsAction({ method: "paypal", reference: "" })).ok).toBe(false);
  });

  it("keeps payout details private to their owner", async () => {
    const othersView = await getPayoutDetails(other.client, owner.id);
    expect(othersView).toBeNull();

    const { data: direct } = await other.client
      .from("instructor_payout_details")
      .select("payout_reference")
      .eq("instructor_id", owner.id);
    expect(direct).toEqual([]);
  });
});
