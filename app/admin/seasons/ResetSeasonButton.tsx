"use client";

// Destructive reset: wipes all games + results for a season. Wrapped in a
// native confirm() so an admin can't clear a live season by a stray click.
export function ResetSeasonButton({
  action,
  seasonId,
  seasonName,
  gameTotal,
}: {
  action: (formData: FormData) => void | Promise<void>;
  seasonId: string;
  seasonName: string;
  gameTotal: number;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Reset ${seasonName}? This permanently deletes all ${gameTotal} game${gameTotal === 1 ? "" : "s"} and their scores/stats for this season. Teams and rosters are kept. This cannot be undone.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={seasonId} />
      <button
        type="submit"
        className="text-goal/60 hover:text-goal font-display tracking-[0.1em] text-[12px] transition-colors"
      >
        RESET SEASON
      </button>
    </form>
  );
}
