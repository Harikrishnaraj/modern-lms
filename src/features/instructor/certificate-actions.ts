"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const templateSchema = z.object({
  courseId: z.string().uuid("Invalid course ID"),
  signatureTitle: z.string().trim().max(200, "Signature title cannot exceed 200 characters").optional(),
  closingMessage: z.string().trim().max(500, "Closing message cannot exceed 500 characters").optional(),
});

export async function saveCertificateTemplateAction(
  formData:
    | { courseId: string; signatureTitle: string; closingMessage: string }
    | FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const raw =
      formData instanceof FormData
        ? {
            courseId: formData.get("courseId"),
            signatureTitle: formData.get("signatureTitle"),
            closingMessage: formData.get("closingMessage"),
          }
        : formData;

    const parsed = templateSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Unauthorized" };
    }

    const { error } = await supabase.rpc("upsert_certificate_template", {
      p_course_id: parsed.data.courseId,
      p_signature_title: parsed.data.signatureTitle ?? null,
      p_closing_message: parsed.data.closingMessage ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/instructor/certificates");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save certificate template",
    };
  }
}
