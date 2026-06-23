import Link from "next/link";

// Shown when no season is marked current. Public pages render a calm message;
// admins get a shortcut to create and activate the first season.
export function NoSeason({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <div className="rise panel p-6 sm:p-10 text-center">
      <div className="eyebrow text-goal">No active season</div>
      <h1 className="font-display text-3xl sm:text-4xl tracking-[0.04em] text-ink mt-3">
        Off-season
      </h1>
      <p className="mx-auto mt-3 max-w-md text-ink-dim text-[14px] sm:text-[15px] leading-relaxed">
        There&apos;s no season in progress yet. Check back once the next one
        drops.
      </p>
      {isAdmin && (
        <Link
          href="/admin/seasons"
          className="mt-6 inline-flex items-center min-h-[44px] px-4 bg-goal text-board font-display tracking-[0.14em] text-[14px] hover:bg-goal-glow transition-colors"
        >
          CREATE A SEASON →
        </Link>
      )}
    </div>
  );
}
