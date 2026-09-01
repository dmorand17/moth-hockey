import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
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
    <div className="mx-auto max-w-md rise">
      <div className="mb-6 rounded-lg overflow-hidden border border-rule">
        <Image
          src="/moth-banner-strip.png"
          alt="M.O.T.H Hockey League"
          width={1200}
          height={432}
          priority
          className="w-full h-auto"
        />
      </div>
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">LOG IN</h1>
        <p className="eyebrow mt-2">We&apos;ll email you a magic link</p>
      </header>

      {sent ? (
        <div className="panel p-5">
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
        <form action={requestLoginLink} className="panel p-5 space-y-4" noValidate>
          {error && (
            <p role="alert" className="text-goal text-sm">
              {error}
            </p>
          )}

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

          <button
            type="submit"
            className="w-full min-h-11 bg-goal hover:bg-goal-glow text-board font-display tracking-[0.14em] text-[15px] rounded transition-colors"
          >
            EMAIL ME A LINK
          </button>
        </form>
      )}

      <p className="mt-5 text-sm text-ink-dim">
        New here?{" "}
        <Link href="/signup" className="text-ice hover:underline min-h-11 inline-flex items-center">
          Create an account
        </Link>
      </p>
    </div>
  );
}
