import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SignUpForm } from "@/components/forms/signup-form";
import { AuthDivider, GoogleSignInButton } from "@/components/forms/google-sign-in-button";
import { signUp } from "@/features/auth/sign-up";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      <Card>
        <CardHeader title="Create your account" description="Start learning in minutes." />
        <CardContent>
          <GoogleSignInButton label="Sign up with Google" />
          <AuthDivider />
          <SignUpForm onSubmit={signUp} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
