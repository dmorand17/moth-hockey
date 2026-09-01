"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Verifies the one-time email token. This runs only on a real form POST from
// the confirm page — link-prefetchers (Outlook SafeLinks, corporate scanners)
// issue GET, so they can no longer consume the token before the user clicks.
export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  // Only allow relative paths through, so ?next= can't be used as an open redirect.
  const nextRaw = String(formData.get("next") ?? "/account");
  const next = nextRaw.startsWith("/") ? nextRaw : "/account";

  if (!tokenHash || !type) {
    redirect("/login?error=missing_token");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(next);
}
