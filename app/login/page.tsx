import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Log in" };
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestLoginLink } from "./actions";

type SearchParams = Promise<{ sent?: string; error?: string }>;

// Map raw error codes / Supabase messages to friendly, actionable copy.
// Expired/used links are common when an email scanner pre-opens the one-time
// link, so we tell the user to just request a fresh one below.
function friendlyError(error: string): string {
  if (error === "missing_email") return "Email is required.";
  const e = error.toLowerCase();
  if (e.includes("missing_token") || e.includes("invalid") || e.includes("expired")) {
    return "That sign-in link has expired or was already used. Request a fresh one below — open it on the same device, and it works only once.";
  }
  return error;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/account");

  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error ? friendlyError(params.error) : null;

  return (
    <div className="mx-auto max-w-sm rise">
      <Image
        src="/moth-logo.png"
        alt=""
        width={64}
        height={64}
        priority
        className="mx-auto mb-3 h-16 w-16"
      />
      <header className="mb-5 text-center">
        <h1 className="font-display text-[40px] leading-[44px] tracking-[0.02em] text-ink">Log in</h1>
        <p className="mt-1 text-[14px] text-ink-faint">We&apos;ll email you a magic link</p>
      </header>

      {sent ? (
        <div className="panel p-5 md:p-6" role="status">
          <p className="text-ink">Check your email.</p>
          <p className="text-ink-dim mt-2 text-sm">
            If an account exists for that address, a sign-in link is on its way.
          </p>
          <p className="text-ink-faint mt-2 text-sm">
            No email after a minute? Check your spam or junk folder — and mark it
            &ldquo;not spam&rdquo; so future links land in your inbox.
          </p>
        </div>
      ) : (
        <form aria-describedby={error ? "form-error" : undefined} action={requestLoginLink} className="panel p-5 md:p-6 space-y-4" noValidate>
          {error && (
            <p id="form-error" role="alert" className="rounded-md border border-loss/50 bg-loss/10 px-3 py-2 text-[14px] text-loss">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-[14px] font-semibold text-ink-dim">Email</span>
            <input
              type="email"
              name="email"
              aria-invalid={params.error === "missing_email" || undefined}
              required
              autoComplete="email"
              inputMode="email"
              className="mt-1.5 w-full bg-board-3 border border-rule-strong rounded-md px-3 min-h-11 text-[16px] text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-0 focus:outline-ice focus:border-ice aria-[invalid=true]:border-loss"
            />
          </label>

          <button
            type="submit"
            className="w-full min-h-11 bg-ice hover:brightness-110 text-board font-bold text-[16px] rounded-md transition"
          >
            Email me a sign-in link
          </button>
        </form>
      )}

      <p className="mt-5 text-[14px] text-ink-dim text-center">
        New here?{" "}
        <Link href="/signup" className="text-ice hover:underline min-h-11 inline-flex items-center">
          Create an account
        </Link>
      </p>
    </div>
  );
}
