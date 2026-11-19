import Link from "next/link";

// Shown when no season is marked current. Public pages render a calm message;
// admins get a shortcut to create and activate the first season.
export function NoSeason({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <div className="rise panel p-6 md:p-10 text-center">
      <p className="eyebrow">No active season</p>
      <h1 className="font-display text-[40px] leading-[44px] md:text-[56px] md:leading-[64px] tracking-[0.02em] text-ink mt-1">
        Off-season
      </h1>
      <p className="mx-auto mt-2 max-w-md text-ink-dim text-[16px] leading-6">
        There&apos;s no season in progress yet. Check back once the next one
        drops.
      </p>
      {isAdmin && (
        <Link
          href="/admin/seasons"
          className="mt-6 inline-flex items-center min-h-[44px] px-5 rounded-md bg-ice text-board font-bold text-[15px] hover:brightness-110 transition"
        >
          Create a season <span aria-hidden className="ml-1">→</span>
        </Link>
      )}
    </div>
  );
}
