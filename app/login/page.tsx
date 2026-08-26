import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestLoginLink } from "./actions";

type SearchParams = Promise<{ sent?: string; error?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/account");

  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error;

  return (
    <div className="mx-auto max-w-md rise">
      <div className="mb-6 rounded-lg overflow-hidden bg-white">
        <Image
          src="/moth-banner.png"
          alt="M.O.T.H Hockey League"
          width={1200}
          height={670}
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
        </div>
      ) : (
        <form action={requestLoginLink} className="panel p-5 space-y-4" noValidate>
          {error && (
            <p role="alert" className="text-goal text-sm">
              {error === "missing_email" ? "Email is required." : error}
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
