# Bulk-Import Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin paste a list of names on `/admin/players` and bulk-create player rows, skipping names that already exist.

**Architecture:** A pure `parsePlayerNames` helper + an `importPlayers` server action in the existing players `actions.ts`, plus a paste `<textarea>` section and summary flash on the players admin page. Mirrors the existing `createPlayer` action and admin form/flash conventions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres). Package manager `bun`.

## Global Constraints

- **No test runner is configured.** Verification per task = `bunx tsc --noEmit` (exit 0) and `bun run lint` (0 errors; 2 pre-existing warnings in `app/admin/schedule/page.tsx` are acceptable). The final task adds a manual local check.
- **Admin only** — every action calls `requireRole(["admin"])`, matching `createPlayer`.
- **Players are `first_name`/`last_name` only** — no team, position, jersey, or photo assignment.
- **Skip existing** — a parsed name matching an existing player (case-insensitive first+last) is skipped, as are repeats within the same paste.
- **Parse rules:** one player per line; a line with a comma is `Last, First`; otherwise `First Last...` (first token = first name, remainder = last name); a line yielding an empty first or last is invalid (counted, not imported).
- Match existing code style/conventions in the files touched. Commit with conventional-commit messages. Do not push. Branch: `feat/import-players` (already created off `staging`).

---

### Task 1: `parsePlayerNames` helper + `importPlayers` server action

**Files:**
- Modify: `app/admin/players/actions.ts` (append the helper + action)

**Interfaces:**
- Consumes existing in-file helpers/imports: `requireRole`, `createSupabaseServerClient`, `revalidatePath`, `redirect`, and the file-local `back(qs)` helper.
- Produces:
  - `export function parsePlayerNames(text: string): { valid: { first: string; last: string }[]; invalidCount: number }`
  - `export async function importPlayers(formData: FormData): Promise<void>` (a form-action that redirects) — consumed by Task 2.

- [ ] **Step 1: Append `parsePlayerNames` and `importPlayers` to `app/admin/players/actions.ts`**

Add at the end of the file:

```ts
// Parse pasted player names, one per line. A line containing a comma is
// "Last, First"; otherwise "First Last..." (first token = first name, the
// rest = last name). Lines that don't yield both a first and last name are
// counted as invalid, not imported.
export function parsePlayerNames(text: string): {
  valid: { first: string; last: string }[];
  invalidCount: number;
} {
  const valid: { first: string; last: string }[] = [];
  let invalidCount = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue; // skip blank lines
    let first = "";
    let last = "";
    if (line.includes(",")) {
      const idx = line.indexOf(",");
      last = line.slice(0, idx).trim();
      first = line.slice(idx + 1).trim();
    } else {
      const m = line.match(/^(\S+)\s+(.+)$/);
      if (m) {
        first = m[1].trim();
        last = m[2].trim();
      }
    }
    if (first && last) valid.push({ first, last });
    else invalidCount++;
  }
  return { valid, invalidCount };
}

// Bulk-create players from pasted names. Skips names that already exist
// (case-insensitive first+last) and repeats within the paste. Redirects back
// with a summary (added / duplicates skipped / invalid lines).
export async function importPlayers(formData: FormData) {
  await requireRole(["admin"]);

  const { valid, invalidCount } = parsePlayerNames(
    String(formData.get("names") ?? ""),
  );
  if (valid.length === 0 && invalidCount === 0) back("error=invalid_input");

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("players")
    .select("first_name, last_name");
  if (fetchErr) back(`error=${encodeURIComponent(fetchErr.message)}`);

  const key = (f: string, l: string) => `${f.toLowerCase()} ${l.toLowerCase()}`;
  const seen = new Set<string>();
  for (const p of existing ?? []) seen.add(key(p.first_name, p.last_name));

  const rows: { first_name: string; last_name: string }[] = [];
  let dup = 0;
  for (const { first, last } of valid) {
    const k = key(first, last);
    if (seen.has(k)) {
      dup++;
      continue;
    }
    seen.add(k);
    rows.push({ first_name: first, last_name: last });
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("players").insert(rows);
    if (insErr) back(`error=${encodeURIComponent(insErr.message)}`);
  }

  revalidatePath("/admin/players");
  redirect(
    `/admin/players?saved=imported&added=${rows.length}&dup=${dup}&bad=${invalidCount}`,
  );
}
```

- [ ] **Step 2: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors. (`importPlayers`/`parsePlayerNames` are exported; being not-yet-consumed is fine — Task 2 wires them in.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/players/actions.ts
git commit -m "feat(players): add importPlayers action + name parser"
```

---

### Task 2: Import UI section + summary flash on `/admin/players`

**Files:**
- Modify: `app/admin/players/page.tsx`

**Interfaces:**
- Consumes: `importPlayers` (Task 1).

- [ ] **Step 1: Import the action**

In `app/admin/players/page.tsx`, change the actions import (currently line 5):

```tsx
import { createPlayer, importPlayers, updateUserRole, linkUserToPlayer } from "./actions";
```

- [ ] **Step 2: Extend the `SearchParams` type with the summary params**

Replace the `SearchParams` type (currently line 23):

```tsx
type SearchParams = Promise<{
  saved?: string;
  error?: string;
  added?: string;
  dup?: string;
  bad?: string;
}>;
```

- [ ] **Step 3: Add an `importSummary` helper**

Add this near the `FLASH_MESSAGES`/`ERROR_MESSAGES` constants (after the `ERROR_MESSAGES` object, around line 33):

```tsx
function importSummary(params: {
  added?: string;
  dup?: string;
  bad?: string;
}): string {
  const added = Number(params.added ?? 0);
  const dup = Number(params.dup ?? 0);
  const bad = Number(params.bad ?? 0);
  const parts = [`Added ${added}`];
  if (dup > 0) parts.push(`skipped ${dup} duplicate${dup === 1 ? "" : "s"}`);
  if (bad > 0)
    parts.push(`${bad} line${bad === 1 ? "" : "s"} couldn't be parsed`);
  return parts.join(" · ") + ".";
}
```

- [ ] **Step 4: Render the import summary in the flash**

Replace the flash `<p>`'s inner expression (currently line 136,
`{FLASH_MESSAGES[flash] ?? "Saved."}`) so the `imported` flash builds a dynamic
summary. The block becomes:

```tsx
      {flash && (
        <p role="status" className="text-ice text-sm">
          {flash === "imported"
            ? importSummary(params)
            : (FLASH_MESSAGES[flash] ?? "Saved.")}
        </p>
      )}
```

- [ ] **Step 5: Add the IMPORT PLAYERS section**

Immediately after the `{/* Create */}` `</section>` (currently ends at line 180) and before the `{/* Accounts awaiting a player link */}` block, insert:

```tsx
      {/* Bulk import */}
      <section className="space-y-3">
        <h2 className="font-display text-xl tracking-[0.04em] text-ink">
          IMPORT PLAYERS
        </h2>
        <form action={importPlayers} className="panel p-4 space-y-3">
          <label className="block">
            <span className="eyebrow">Paste names — one per line</span>
            <textarea
              name="names"
              required
              rows={6}
              placeholder={"Wayne Gretzky\nGretzky, Wayne"}
              className="mt-1 w-full bg-board-3 border border-rule rounded px-3 py-2 text-ink focus:outline-none focus:border-ice font-mono text-[13px]"
            />
          </label>
          <p className="text-ink-faint text-[12px] leading-relaxed">
            One player per line — use <strong>First Last</strong> or{" "}
            <strong>Last, First</strong>. Names already in the list are skipped.
          </p>
          <button
            type="submit"
            className="min-h-11 px-4 bg-ice/10 hover:bg-ice/20 border border-ice/40 text-ice font-display tracking-[0.14em] text-[13px] rounded transition-colors"
          >
            IMPORT
          </button>
        </form>
      </section>
```

- [ ] **Step 6: Verify types + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: tsc exit 0; lint 0 errors.

- [ ] **Step 7: Manual verification (local)**

Start the stack + dev server (see `docs/LOCAL-TESTING.md`), sign in as
`admin@moth.test`, open `/admin/players`. In the IMPORT PLAYERS box paste:

```
Wayne Gretzky
Gretzky, Wayne
Doug Morand
Wayne Gretzky
Gordie

```

(`Doug Morand` is a seeded player; the trailing blank line and single-token
`Gordie` exercise blank/invalid handling.) Submit and confirm:
- Flash reads **"Added 1 · skipped 3 duplicates · 1 line couldn't be parsed."**
  (`Wayne Gretzky` added once; the comma form `Gretzky, Wayne` + the repeat +
  existing `Doug Morand` = 3 skipped; `Gordie` = 1 invalid; blank line ignored.)
- Only one new `Wayne Gretzky` appears in the players list; no duplicate created.

- [ ] **Step 8: Commit**

```bash
git add app/admin/players/page.tsx
git commit -m "feat(players): paste-to-import players UI + summary"
```

---

## Self-Review

**Spec coverage:**
- Paste `<textarea>` input → Task 2 Step 5. ✅
- `parsePlayerNames` with `Last, First` / `First Last` rules + invalid counting → Task 1 Step 1. ✅
- Skip existing (case-insensitive) + de-dupe within paste → Task 1 Step 1 (`seen` set). ✅
- One-step action + summary flash (`added`/`dup`/`bad`) → Task 1 (redirect) + Task 2 Steps 2–4. ✅
- Admin-only → `requireRole(["admin"])` in Task 1. ✅
- Manual verification → Task 2 Step 7. ✅

**Placeholder scan:** none — all steps carry full code.

**Type consistency:** `importPlayers`/`parsePlayerNames` signatures in Task 1 match their use in Task 2 (`importPlayers` as a form action; the summary params `added`/`dup`/`bad` set by the redirect are read by `importSummary`). The `key(f, l)` helper and `seen` set use the same lowercased `"first last"` format for both existing rows and parsed names.
