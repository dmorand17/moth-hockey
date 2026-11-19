import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign up" };
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PhoneInput from "@/components/PhoneInput";
import { requestSignupLink } from "./actions";

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/account");

  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error;

  return (
    <div className="mx-auto max-w-sm rise">
      <header className="mb-5 text-center">
        <h1 className="font-display text-[40px] leading-[44px] tracking-[0.02em] text-ink">Sign up</h1>
        <p className="mt-1 text-[14px] text-ink-faint">Magic link to your inbox · no password needed</p>
      </header>

      {sent ? (
        <div className="panel p-5 md:p-6" role="status">
          <p className="text-ink">Check your email — we sent a sign-in link.</p>
          <p className="text-ink-dim mt-2 text-sm">
            Click the link to confirm your account. The link expires in an hour.
          </p>
          <p className="text-ink-faint mt-2 text-sm">
            No email after a minute? Check your spam or junk folder — and mark it
            &ldquo;not spam&rdquo; so future links land in your inbox.
          </p>
        </div>
      ) : (
        <form aria-describedby={error ? "form-error" : undefined} action={requestSignupLink} className="panel p-5 md:p-6 space-y-4" noValidate>
          {error && (
            <p id="form-error" role="alert" className="rounded-md border border-loss/50 bg-loss/10 px-3 py-2 text-[14px] text-loss">
              {error === "missing_fields" ? "Email and full name are required." : error}
            </p>
          )}

          <label className="block">
            <span className="text-[14px] font-semibold text-ink-dim">Full name</span>
            <input
              type="text"
              name="full_name"
              aria-invalid={error === "missing_fields" || undefined}
              required
              autoComplete="name"
              className="mt-1.5 w-full bg-board-3 border border-rule-strong rounded-md px-3 min-h-11 text-[16px] text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-0 focus:outline-ice focus:border-ice aria-[invalid=true]:border-loss"
            />
          </label>

          <label className="block">
            <span className="text-[14px] font-semibold text-ink-dim">Email</span>
            <input
              type="email"
              name="email"
              aria-invalid={error === "missing_fields" || undefined}
              required
              autoComplete="email"
              inputMode="email"
              className="mt-1.5 w-full bg-board-3 border border-rule-strong rounded-md px-3 min-h-11 text-[16px] text-ink placeholder:text-ink-faint focus:outline-2 focus:outline-offset-0 focus:outline-ice focus:border-ice aria-[invalid=true]:border-loss"
            />
          </label>

          <label className="block">
            <span className="text-[14px] font-semibold text-ink-dim">Phone <span className="font-normal text-ink-faint">(optional)</span></span>
            <PhoneInput
              name="phone"
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
        Already have an account?{" "}
        <Link href="/login" className="text-ice hover:underline min-h-11 inline-flex items-center">
          Log in
        </Link>
      </p>
    </div>
  );
}
