import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "@/components/forms/login-form";
import { AuthDivider, GoogleSignInButton } from "@/components/forms/google-sign-in-button";
import { login } from "@/features/auth/login";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const ssoError =
    error === "sso_failed"
      ? "Google sign-in did not complete. Please try again."
      : error === "sso_unavailable"
        ? "Google sign-in is not available right now. Please log in with your email."
        : error === "rate_limited"
          ? "Too many attempts. Please wait a while and try again."
          : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      <Card>
        <CardHeader title="Welcome back" description="Log in to continue learning." />
        <CardContent>
          {ssoError && (
            <p role="alert" className="mb-4 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
              {ssoError}
            </p>
          )}
          <GoogleSignInButton next={next ?? null} />
          <AuthDivider />
          <LoginForm onSubmit={login.bind(null, next ?? null)} />
        </CardContent>
      </Card>

      <p className="mt-3 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
