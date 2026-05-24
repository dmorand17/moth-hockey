import type { NextRequest } from "next/server";
import { updateAuthSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateAuthSession(request);
}

export const config = {
  // Skip Next internals and static assets — auth refresh isn't needed for them.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
