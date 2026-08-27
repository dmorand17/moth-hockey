import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// token_hash / verifyOtp flow. Unlike the PKCE `code` flow (see ./callback),
// this needs no client-side code_verifier, so magic links work even when opened
// in a different browser/device (or an email app's in-app browser) than the one
// that requested them.

// Build the redirect from the real host header — Next normalizes request.url to
// "localhost" in dev, which strands the auth cookie set on 127.0.0.1.
function redirectTo(request: NextRequest, path: string, search?: string) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(new URL(`${proto}://${host}${path}${search ?? ""}`));
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const next = request.nextUrl.searchParams.get("next") ?? "/account";

  if (!tokenHash || !type) {
    return redirectTo(request, "/login", "?error=missing_token");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return redirectTo(request, "/login", `?error=${encodeURIComponent(error.message)}`);
  }

  return redirectTo(request, next);
}
