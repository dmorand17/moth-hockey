import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Build the redirect URL from the actual request host header — Next.js
// normalizes both request.url and request.nextUrl to "localhost" in dev, which
// strands the auth cookie set on 127.0.0.1.
function redirectTo(request: NextRequest, path: string, search?: string) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const target = new URL(`${proto}://${host}${path}${search ?? ""}`);
  return NextResponse.redirect(target);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/account";

  if (!code) {
    return redirectTo(request, "/login", "?error=missing_code");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectTo(request, "/login", `?error=${encodeURIComponent(error.message)}`);
  }

  return redirectTo(request, next);
}
