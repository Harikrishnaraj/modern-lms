import { z } from "zod";

/** Complexity rules are fixed; the minimum length is configurable (T-143's platform_settings). */
function strongPassword(minLength: number) {
  return z
    .string()
    .min(minLength, `Password must be at least ${minLength} characters`)
    .regex(/[A-Za-z]/, "Password must include a letter")
    .regex(/[0-9]/, "Password must include a number");
}

export function buildSignUpSchema(minLength: number) {
  return z
    .object({
      email: z.email("Enter a valid email address"),
      password: strongPassword(minLength),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}

export interface SignUpInput {
  email: string;
  password: string;
  confirmPassword: string;
}

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export function buildResetPasswordSchema(minLength: number) {
  return z
    .object({
      password: strongPassword(minLength),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
}

export interface ResetPasswordInput {
  password: string;
  confirmPassword: string;
}
