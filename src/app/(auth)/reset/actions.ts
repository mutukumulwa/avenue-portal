"use server";

import { PasswordResetService } from "@/server/services/password-reset.service";

export async function requestResetAction(
  _prev: { sent?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ sent?: boolean; error?: string }> {
  const email = (formData.get("email") as string) || "";
  if (!email) return { error: "Email is required." };
  await PasswordResetService.request(email);
  // Always report sent — do not reveal whether the email exists.
  return { sent: true };
}

export async function confirmResetAction(
  _prev: { done?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ done?: boolean; error?: string }> {
  const email = (formData.get("email") as string) || "";
  const code = (formData.get("code") as string) || "";
  const password = (formData.get("password") as string) || "";
  const error = await PasswordResetService.confirm(email, code, password);
  if (error) return { error };
  return { done: true };
}
