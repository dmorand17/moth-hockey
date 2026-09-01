import { redirect } from "next/navigation";
import { confirmSignIn } from "./actions";

type SearchParams = Promise<{ token_hash?: string; type?: string; next?: string }>;

// Interstitial confirm page. The email link lands here (GET) and we render a
// button that POSTs to verify. We deliberately do NOT verify on GET: email
// security scanners pre-fetch links with GET and would otherwise burn the
// one-time token before the user clicks, causing "link invalid or expired".
export default async function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  const { token_hash: tokenHash, type, next } = await searchParams;

  if (!tokenHash || !type) {
    redirect("/login?error=missing_token");
  }

  return (
    <div className="mx-auto max-w-md rise">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-[0.06em] text-ink">SIGN IN</h1>
        <p className="eyebrow mt-2">One tap to finish signing in</p>
      </header>

      <form action={confirmSignIn} className="panel p-5 space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/account"} />

        <p className="text-ink-dim text-sm">
          Tap the button to complete your sign-in. The link works once.
        </p>

        <button
          type="submit"
          className="w-full min-h-11 bg-goal hover:bg-goal-glow text-board font-display tracking-[0.14em] text-[15px] rounded transition-colors"
        >
          SIGN IN
        </button>
      </form>
    </div>
  );
}
