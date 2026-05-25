"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatPhone } from "@/lib/format";

export async function requestSignupLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = formatPhone(String(formData.get("phone") ?? ""));

  if (!email || !fullName) {
    redirect("/signup?error=missing_fields");
  }

  const supabase = await createSupabaseServerClient();
  const origin = (await headers()).get("origin") ?? "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback?next=/account`,
      data: {
        full_name: fullName,
        ...(phone ? { phone } : {}),
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/signup?sent=1");
}
