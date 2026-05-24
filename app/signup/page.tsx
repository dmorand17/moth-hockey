import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    <div className="mx-auto max-w-md rise">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">SIGN UP</h1>
        <p className="eyebrow mt-2">Magic link to your inbox · no password needed</p>
      </header>

      {sent ? (
        <div className="panel p-5">
          <p className="text-ink">Check your email — we sent a sign-in link.</p>
          <p className="text-ink-dim mt-2 text-sm">
            Click the link to confirm your account. The link expires in an hour.
          </p>
        </div>
      ) : (
        <form action={requestSignupLink} className="panel p-5 space-y-4" noValidate>
          {error && (
            <p role="alert" className="text-goal text-sm">
              {error === "missing_fields" ? "Email and full name are required." : error}
            </p>
          )}

          <label className="block">
            <span className="eyebrow">Full name</span>
            <input
              type="text"
              name="full_name"
              required
              autoComplete="name"
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
            />
          </label>

          <label className="block">
            <span className="eyebrow">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              inputMode="email"
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
            />
          </label>

          <label className="block">
            <span className="eyebrow">Phone <span className="normal-case tracking-normal text-ink-faint">(optional)</span></span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              inputMode="tel"
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 min-h-11 text-ink focus:outline-none focus:border-ice"
            />
          </label>

          <button
            type="submit"
            className="w-full min-h-11 bg-goal hover:bg-goal-glow text-board font-display tracking-[0.14em] text-[15px] rounded transition-colors"
          >
            EMAIL ME A LINK
          </button>
        </form>
      )}

      <p className="mt-5 text-sm text-ink-dim">
        Already have an account?{" "}
        <Link href="/login" className="text-ice hover:underline min-h-11 inline-flex items-center">
          Log in
        </Link>
      </p>
    </div>
  );
}
