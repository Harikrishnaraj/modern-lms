import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, ShieldAlert, ShieldCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { normalizeCertificateCode, verifyCertificate } from "@/features/certificates/queries";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";

// Verification results are per-code and sensitive to enumeration: keep them out of search indexes.
export const metadata: Metadata = {
  title: "Certificate verification",
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const code = normalizeCertificateCode(decodeURIComponent(id));
  if (!code) notFound();

  // Codes are unguessable, but throttle bulk probing anyway (SECURITY sections 18-19).
  if (!(await rateLimit("certificate-verify", await clientIp()))) {
    return (
      <Card className="p-6" role="alert">
        <h1 className="text-lg font-semibold">Too many verification requests</h1>
        <p className="mt-1 text-text-secondary">{RATE_LIMITED_MESSAGE}</p>
      </Card>
    );
  }

  const cert = await verifyCertificate(await createClient(), code);
  if (!cert) notFound();

  const revoked = cert.status === "revoked";
  return (
    <article className="space-y-6">
      <div
        role="status"
        className={`flex items-start gap-3 rounded-card border p-4 ${
          revoked
            ? "border-danger bg-danger-light text-danger-text"
            : "border-success bg-success-light text-success-text"
        }`}
      >
        {revoked ? (
          <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        ) : (
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        )}
        <div>
          <h1 className="font-semibold">
            {revoked ? "This certificate has been revoked" : "This certificate is valid"}
          </h1>
          <p className="text-sm">
            {revoked && cert.revokedAt
              ? `Revoked on ${dateFormat.format(new Date(cert.revokedAt))}. It should no longer be relied on.`
              : "It was issued by Modern LMS and has not been revoked."}
          </p>
        </div>
      </div>

      <Card className="space-y-5 p-8 text-center">
        <Award className="mx-auto size-10 text-primary" aria-hidden="true" />
        <p className="text-sm tracking-widest text-text-secondary uppercase">Certificate of completion</p>
        <p className="text-sm text-text-secondary">This certifies that</p>
        <p className="font-display text-3xl font-bold">{cert.learnerName}</p>
        <p className="text-sm text-text-secondary">has successfully completed</p>
        <p className="text-xl font-semibold">{cert.courseTitle}</p>
        {cert.closingMessage && <p className="text-sm text-text-secondary italic">{cert.closingMessage}</p>}
        <dl className="mx-auto grid max-w-sm gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Issued</dt>
            <dd>{dateFormat.format(new Date(cert.issuedAt))}</dd>
          </div>
          {cert.instructorName && (
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Instructor</dt>
              <dd>
                {cert.instructorName}
                {cert.signatureTitle ? `, ${cert.signatureTitle}` : ""}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Certificate ID</dt>
            <dd>
              <code className="font-mono">{cert.code}</code>
            </dd>
          </div>
        </dl>
      </Card>

      <Link href="/certificates/verify" className={buttonClasses({ variant: "secondary" })}>
        Verify another certificate
      </Link>
    </article>
  );
}
