# Season Recap PR 2 — AI Summary, Hat-Trick Card, Jump Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins generate, edit and publish a frozen AI-written season summary on `/seasons/[slug]/recap`. The recap also gets one hat-trick summary card instead of a card per hat trick, and a sticky jump-link bar.

**Architecture:** Two tables: `season_recaps` (published, public read) and `season_recap_drafts` (admins only). Pure modules in `lib/recap-summary/` build the facts JSON, the prompt, the output parser and the number fact-check. Admin server actions write the draft through the request client, so RLS backs up the role check. They call the existing OpenRouter `generateText` with a larger token budget. The page renders the published summary with the existing `PostBody` markdown renderer, and admins also get a client panel.

**Tech Stack:** Next.js 16.2.6 App Router (params are Promises), React 19.2.4, Supabase (Postgres + RLS), Tailwind v4, bun test, OpenRouter.

**Spec:** `docs/superpowers/specs/2026-11-19-season-recap-design.md` (sections "AI summary (PR 2)", "Admin workflow after finalizing"). User decisions made after the spec are recorded under Global Constraints.

## Global Constraints

- Work in worktree `.worktrees/recap-summary`, branch `feat/recap-summary` off `origin/staging`. PR targets `staging`.
- bun only (`bun run test`, `bunx supabase …`). Read `node_modules/next/dist/docs/` before any unfamiliar Next API.
- The summary is generated **once** on admin request. It is never regenerated per request or automatically.
- An unpublished summary or a draft is never visible to non-admins. RLS enforces this, not just the UI.
- Only admins can generate, edit, publish or unpublish.
- The prompt asks for 250–400 words in 3–5 short markdown paragraphs. It must use only the provided facts and never invent stats, quotes or names. It mentions the champion, the playoff run, award winners and 2–3 storylines.
- Rendering: markdown without raw HTML (reuse `components/PostBody.tsx`). The note "Written with AI from league stats" is 13px, plus "Edited by an admin" when `edited_at` is set.
- Regenerating writes the draft only. What the league sees changes only on Publish.
- Mobile-first: verify at 390px first, then 1440. Tap targets are at least 44px.
- **User decision (hat tricks):** one "Hat tricks" card shows the total count and the players, `×N` when N>1, most first. Any 4+ goal game also gets its own "Big night" card.
- **User decision (navigation):** a sticky jump-link bar under the hero, with Summary · Awards · Season · Playoffs · Board. It shows only the sections present. Anchors work in shared links (`#playoffs`).
- **Ruling (spec dependency):** the spec says PR 2 builds on `chore/write-up-models`. The user dropped that branch and set the models in Vercel env. PR 2 builds on `staging` as is and only adds `maxTokens`. This plan does not change the default model constants.

## Review Focus

1. A season with no playoffs or no champion (imported, or playoffs not played). Expected: facts have `champion: null` and `playoffs: null`, the prompt tells the model not to name a champion, and the generate action does not crash. Test in Task 5 and Task 6.
2. An anonymous or non-admin client reading `season_recap_drafts`, or an unpublished `season_recaps` row, through the public API. Expected: zero rows. psql check in Task 3.
3. Model output wrapped in code fences, too short, or truncated. Expected: rejected with a reason, and nothing written to the draft. Test in Task 6.
4. An admin regenerates while a summary is published. Expected: the published text is unchanged until Publish. Browser check in Task 8.
5. Hat tricks scored by subs for another team. Expected: excluded from the card (roster rule). Test in Task 1.

---

### Task 1: Hat-trick summary card + Big night; move moment text to lib

**Files:**
- Modify: `lib/season-recap.ts` (Moment kinds, `notableMoments`, new `describeMoment`, move `Names` type here)
- Modify: `components/recap/parts.tsx` (use `describeMoment`; import `Names` from lib and re-export it)
- Test: `lib/season-recap.test.ts`

**Interfaces:**
- Produces:
  - `Moment.kind`: `"margin" | "high-scoring" | "hat-tricks" | "big-night" | "points-game" | "win-streak"`. `"hat-trick"` is removed.
  - `Moment` gains `players?: { playerId: string; count: number }[]`, set only for `hat-tricks`.
  - `export type Names = { teams: Map<string, { name: string; slug: string; color: string }>; players: Map<string, { id: string; name: string }> }`. Keep it structurally compatible with `RecapTeam`.
  - `export function describeMoment(m: Moment, game: RecapGame | undefined, names: Names): { label: string; text: string }`

- [ ] **Step 1: Write the failing tests** (replace `finds hat tricks`, and update the roster-rule tests to filter `hat-tricks`/`big-night`)

```ts
test("hat tricks collapse into one card, most first", () => {
  const games = [g("h1", "A", "B", 3, 0), g("h2", "A", "B", 3, 0), g("h3", "B", "A", 3, 0)];
  const ev = [
    ...[1, 2, 3].map(() => goal("h1", "A", "p1")),
    ...[1, 2, 3].map(() => goal("h2", "A", "p1")),
    ...[1, 2, 3].map(() => goal("h3", "B", "p2")),
  ];
  const m = notableMoments(games, ev, "regular");
  expect(m.filter((x) => x.kind === "hat-tricks")).toEqual([
    expect.objectContaining({ gameId: null, value: 3, players: [{ playerId: "p1", count: 2 }, { playerId: "p2", count: 1 }] }),
  ]);
  expect(m.some((x) => (x.kind as string) === "hat-trick")).toBe(false);
});

test("a 4+ goal game is a big night and still counts as a hat trick", () => {
  const games = [g("b", "A", "B", 4, 0)];
  const ev = [1, 2, 3, 4].map(() => goal("b", "A", "p1"));
  const m = notableMoments(games, ev, "regular");
  expect(m).toContainEqual(expect.objectContaining({ kind: "big-night", gameId: "b", playerId: "p1", value: 4 }));
  expect(m.find((x) => x.kind === "hat-tricks")?.value).toBe(1);
});

test("describeMoment formats the hat-trick card", () => {
  const names = { teams: new Map(), players: new Map([["p1", { id: "p1", name: "Lane Kane" }], ["p2", { id: "p2", name: "Kai Hale" }]]) };
  const m = { kind: "hat-tricks", gameId: null, teamId: null, playerId: null, value: 3, date: "", players: [{ playerId: "p1", count: 2 }, { playerId: "p2", count: 1 }] } as const;
  expect(describeMoment(m, undefined, names)).toEqual({ label: "Hat tricks · 3", text: "Lane Kane ×2 · Kai Hale" });
});
```

- [ ] **Step 2: Run** `bun test lib/season-recap.test.ts`. Expected: FAIL (no `hat-tricks` kind, `describeMoment` not exported).
- [ ] **Step 3: Implement.** In `notableMoments`, a player's hat-trick games are their 3+ goal games (same roster rule). Push one `hat-tricks` moment, at the position of the old per-game ones, when there is at least one. `value` = total games, `date` = the first hat trick's date. Sort `players` by count desc, then first-hat-trick date. After it, push one `big-night` moment per 4+ goal game, in date order. Move `momentText` from parts.tsx into `describeMoment` unchanged for the other kinds. `big-night`: label `"Big night"`, text `` `${player} scored ${n} (${matchup})` ``. The `hat-tricks` card has `gameId: null`, so `RecapMoments` already renders it as a non-link panel.
- [ ] **Step 4: Run** `bun run test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(recap): one hat-trick card plus big-night moments`

### Task 1b: Collapse award ties

**User decision:** an award shared by 3+ players (for example Goon with 5) shows one line, "5 tied with 4 penalties", which expands to the names. Awards with 1–2 winners render as today.

**Files:**
- Modify: `lib/awards.ts` (add `tieSummary`), `components/AwardWinners.tsx`, `app/seasons/[slug]/recap/page.tsx` (pass totals)
- Test: `lib/awards.test.ts`

**Interfaces:**
- Produces: `export function tieSummary(type: string, winnerIds: string[], totals: { player_id: string; goals: number; assists: number; penalties: number }[]): string`
  - `goon` uses penalties, `sniper` uses goals, `playmaker` uses assists.
  - It returns `` `${n} tied with ${v} ${unit}` `` only when every winner has the same value. Otherwise it returns `` `${n} tied` ``.
  - The unit is singular when `v === 1`.
- `AwardWinners` gains an optional `totals` prop, of the same shape.

- [ ] **Step 1: Failing tests.**
  - `tieSummary("goon", ["a","b","c"], [a:4 pen, b:4, c:4])` → `"3 tied with 4 penalties"`.
  - Mixed values → `"3 tied"`.
  - `"mvd"` → `"3 tied"`.
  - A single penalty → `"3 tied with 1 penalty"`.
- [ ] **Step 2: Run** `bun test lib/awards.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `AwardWinners`, when `winners.length >= 3`, render a `Disclosure` (`components/Disclosure.tsx`) in place of the name list. Its label is the `tieSummary` text and its content is the linked names (each still ≥44px). The recap page passes `totals={regular}`. Without totals the label is just `"N tied"`.
- [ ] **Step 4: Verify.** Run `bun run test`. At 390px, the Goon card in the swipe row stays 220px wide and expands in place. Check the 1440 grid too.
- [ ] **Step 5: Commit** `feat(recap): collapse award ties into an expandable line`

### Task 2: Sticky jump-link bar

**Files:**
- Create: `components/recap/JumpBar.tsx` (client)
- Modify: `lib/season-recap.ts` (add `jumpLinks`), `app/seasons/[slug]/recap/page.tsx` (section ids + bar)
- Test: `lib/season-recap.test.ts`

**Interfaces:**
- Produces: `export function jumpLinks(has: { summary: boolean; awards: boolean; season: boolean; playoffs: boolean; board: boolean }): { id: string; label: string }[]`. Ids and labels in order: `summary` "Summary", `awards` "Awards", `season` "Season", `playoffs` "Playoffs", `board` "Board".

- [ ] **Step 1: Failing test:** `jumpLinks({summary:false, awards:true, season:true, playoffs:false, board:true}).map(l=>l.id)` equals `["awards","season","board"]`.
- [ ] **Step 2: Run** `bun test lib/season-recap.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `jumpLinks`. Then build `JumpBar({ links })` as a client component. It uses the sticky pattern from `components/ScheduleView.tsx:91`: `sticky top-[calc(var(--header-h)-var(--header-shown)*48px)]` on mobile and `top-[var(--header-h)]` at `sm`, with `bg-board/95 backdrop-blur-sm`, a horizontal scroll row and `min-h-11` chip anchors. An IntersectionObserver marks the chip of the section in view as active (`aria-current="true"`). Render no bar when there are fewer than 2 links. Put the ids on the page sections. The Season id wraps the regular-season numbers, standings, leaders and moments. Give those sections `scroll-mt-[calc(var(--header-h)+60px)]!` so headings clear the bar. Show the bar only in the complete state.
- [ ] **Step 4: Verify.** `bun run test` passes. At 390px and 1440, tapping each chip lands with the heading visible below the bar, and `/seasons/spring-2026/recap#playoffs` opens at Playoffs.
- [ ] **Step 5: Commit** `feat(recap): sticky jump links`

### Task 3: Migration — `season_recaps` and `season_recap_drafts`

**Files:**
- Create: `supabase/migrations/0029_season_recaps.sql`
- Modify: `lib/supabase/database.types.ts` (regenerate), `docs/DATABASE.md` (tables, RLS rows, migrations row)

- [ ] **Step 1: Write the migration.** Columns as in the spec. `season_recaps`: `season_id uuid primary key references seasons(id) on delete cascade`, `summary_markdown text not null`, `input jsonb not null`, `model text not null`, `generated_at timestamptz not null`, `edited_by uuid references auth.users(id) on delete set null`, `edited_at timestamptz`, `published boolean not null default true`, `published_at timestamptz`. `season_recap_drafts`: `season_id` (pk, fk, cascade), `draft_markdown text not null`, `input jsonb not null`, `model text not null`, `generated_at timestamptz not null`, `edited_by`, `edited_at`. Enable RLS on both. Policies: `"public read published recaps"` for select using `published or public.is_admin()`. `"admins manage recaps"` for all using/with check `public.is_admin()`. `"admins manage recap drafts"` for all using/with check `public.is_admin()`. No public policy on drafts.
- [ ] **Step 2: Apply.** Run `bunx supabase migration up` (keeps local data). Expected: applies 0029 without error.
- [ ] **Step 3: RLS check (Review Focus 2).** Insert one unpublished recap and one draft as postgres for a real season id. Then:

```bash
docker exec supabase_db_moth-hockey psql -U postgres -Atc "set role anon; select count(*) from season_recaps; select count(*) from season_recap_drafts;"
```
Expected: `0` and `0`. Flip it to `published = true`, re-run, expected `1` and `0`. Delete the test rows.
- [ ] **Step 4: Regenerate types.** Run `bunx supabase gen types typescript --local > lib/supabase/database.types.ts`, then `bunx tsc --noEmit`. Expected: clean.
- [ ] **Step 5: Docs, then commit.** Add both tables, their RLS and migration 0029 to `docs/DATABASE.md`. Commit `feat(recap): season_recaps and admin-only drafts`.

### Task 4: `generateText` output budget

**Files:** Modify `lib/write-ups/openrouter.ts`. Test `lib/write-ups/openrouter.test.ts`.

**Interfaces:** Produces `generateText(system: string, user: string, opts?: { maxTokens?: number }): Promise<ModelResult>`. The default stays 1000, and `callOnce` takes `maxTokens`.

- [ ] **Step 1: Failing test:** `generateText("s","u",{maxTokens: 4000})` sends `max_tokens: 4000`. A second assertion checks that a call without opts still sends 1000. Follow the existing `mock(async (_url, init) => …)` pattern and read `JSON.parse(init.body)`.
- [ ] **Step 2: Run** `bun test lib/write-ups/openrouter.test.ts`. Expected: FAIL on 4000.
- [ ] **Step 3: Implement.** Pass it through to both the primary and fallback calls.
- [ ] **Step 4: Run** `bun run test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(write-ups): optional maxTokens on generateText`

### Task 5: Facts — `computeRecap` + `buildRecapFacts`

**Files:**
- Create: `lib/recap-summary/facts.ts`, `lib/recap-summary/facts.test.ts`
- Modify: `app/seasons/[slug]/recap/page.tsx` (use `computeRecap` in place of its inline computations, with no visual change)

**Interfaces:**
- Consumes: `SeasonRecap` (`import type` from `@/lib/queries`), plus `computeSeasonTotals`, `seasonNumbers`, `notableMoments`, `playoffPath`, `goalieMinGames`, `topSkaters`, `topGoalies` and `describeMoment` (Task 1).
- Produces:

```ts
export type RecapComputed = {
  regular: SeasonTotals[]; playoffTotals: SeasonTotals[];
  regNumbers: SeasonNumbers | null; poNumbers: SeasonNumbers | null;
  regMoments: Moment[]; poMoments: Moment[];
  path: RecapGame[]; minGoalieGames: number;
};
export function computeRecap(r: SeasonRecap): RecapComputed; // exactly what page.tsx computes today
type Leader = { player: string; team: string | null; value: number };
export type RecapFacts = {
  season: { name: string; start: string; end: string | null };
  champion: string | null;
  standings: { team: string; record: string; pts: number; gf: number; ga: number }[] | null; // record "W-L-OTL"
  historicalStandings: { team: string; gf: number; ga: number; diff: number }[] | null;      // only when standings is null
  regular: { numbers: SeasonNumbers | null; leaders: { points: Leader[]; goals: Leader[]; assists: Leader[]; goalies: (Leader & { gp: number })[] }; moments: string[] };
  playoffs: { games: { round: string; away: string; home: string; score: string; decidedIn: string }[]; leaders: Leader[]; moments: string[] } | null;
  awards: { award: string; winners: string[] }[];
};
export function buildRecapFacts(r: SeasonRecap, c: RecapComputed): RecapFacts;
```
Leaders are the top 5 (goalie `value` = GAA rounded to 2 decimals). Moment strings are `` `${label}: ${text}` `` from `describeMoment`. A score reads `"3-2"` (away-home) with team names in `away`/`home`. `playoffs` is null when `c.path` is empty.

- [ ] **Step 1: Failing tests** with a small hand-built `SeasonRecap` fixture (2 teams, 2 regular games, 1 final, 1 award). Assertions: `champion === "Ember Wolves"`, `standings[0].record === "1-0-0"`, `playoffs.games[0]` matches `{ round: "final", score: "2-1" }`, `awards[0]` equals `{ award: "MVP", winners: ["Lane Kane"] }`. **Review Focus 1:** the same fixture with no playoff games and `championTeamId: null` gives `playoffs === null` and `champion === null`.
- [ ] **Step 2: Run** `bun test lib/recap-summary`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement**, then switch `page.tsx` to `computeRecap(r)`.
- [ ] **Step 4: Run** `bun run test && bunx tsc --noEmit`. Expected: pass. The recap page at 390px looks the same as before.
- [ ] **Step 5: Commit** `feat(recap): season facts for the AI summary`

### Task 6: Prompt, parser, fact check

**Files:** Create `lib/recap-summary/prompt.ts`, `lib/recap-summary/check.ts`, and tests for each.

**Interfaces:**
- `export const RECAP_SYSTEM: string` and `export function buildRecapPrompt(facts: RecapFacts): string`. The user message holds the rules, then `FACTS:` and `JSON.stringify(facts)`.
- `export function parseRecapSummary(text: string): { ok: true; markdown: string } | { ok: false; reason: string }`. Strip surrounding ``` fences, trim, collapse 3+ newlines. Reject empty output. Accept 150–500 words (the prompt asks for 250–400).
- `export function numbersNotInFacts(markdown: string, facts: RecapFacts): string[]`. Every `\d+(?:\.\d+)?` in the text that is not a number or digit run anywhere in the facts JSON, including inside strings like `"3-4-1"` and `"Spring 2026"`. Unique, in order of first appearance. Number words are not checked (note it in a comment).

- [ ] **Step 1: Failing tests.**
  - `buildRecapPrompt(facts)` contains the champion name, `"250–400 words"`, `"Use only the facts"` and `"FACTS:"`.
  - With `champion: null` the prompt contains `"No champion"` and does not ask the model to name one (Review Focus 1).
  - `parseRecapSummary("```markdown\n" + words(300) + "\n```")` is ok without fences.
  - `parseRecapSummary(words(40))` gives `{ ok: false }` with a reason containing `"40 words"` (Review Focus 3).
  - `numbersNotInFacts("went 3-4-1 with 10 points and 99 goals in 2026", facts)` equals `["99"]` when the facts have record `"3-4-1"`, pts 10 and name `"Spring 2026"`.
  - `"2.5 GAA"` with a goalie value of 2.5 gives `[]`.
- [ ] **Step 2: Run** `bun test lib/recap-summary`. Expected: FAIL.
- [ ] **Step 3: Implement.** The prompt voice is a fun, friendly recap for a rec "Mostly Over The Hill" league. Rules: 3–5 short paragraphs, markdown with no headings, never invent stats, quotes or names, mention the champion, the playoff run and the award winners, and pick 2–3 storylines from the facts. When `champion` is null, write "No champion was decided; don't name one". When `playoffs` is null, write "There were no playoffs".
- [ ] **Step 4: Run** `bun run test`. Expected: pass.
- [ ] **Step 5: Commit** `feat(recap): summary prompt, parser and number check`

### Task 7: Query + admin server actions

**Files:**
- Modify: `lib/queries.ts`
- Create: `app/seasons/[slug]/recap/summary-actions.ts`

**Interfaces:**
- `export type RecapSummaryRow = { markdown: string; input: RecapFacts; model: string; generated_at: string; edited_at: string | null; published?: boolean }`
- `export async function getRecapSummary(seasonId: string): Promise<{ published: RecapSummaryRow | null; draft: RecapSummaryRow | null }>`. It uses the request client. RLS returns the draft and unpublished rows only to admins. `published` here means the `season_recaps` row, with its `published` flag.
- Server actions (`"use server"`), each returning `ActionResult` and calling `revalidatePath(`/seasons/${slug}/recap`)`:
  - `generateRecapSummary({ slug })`
  - `saveRecapDraft({ slug, markdown })` (1–6000 chars after trim)
  - `publishRecapSummary({ slug })`
  - `unpublishRecapSummary({ slug })`
- Admin gate: copy `adminOnly()` from `app/games/[id]/write-up-actions.ts`.

- [ ] **Step 1: Implement `getRecapSummary`.**
- [ ] **Step 2: Implement the actions.**
  - generate: `getSeasonRecap(slug)`. Fail with "Season isn't complete yet." unless `state === "complete"`. Then `computeRecap` → `buildRecapFacts` → `generateText(RECAP_SYSTEM, buildRecapPrompt(facts), { maxTokens: 4000 })` → `parseRecapSummary`. On a parse failure, return `fail(reason)` and write nothing. Otherwise upsert the draft (`edited_by`/`edited_at` null) and return `ok("Draft ready")`.
  - save: upsert the draft. If there is no draft, copy `input`/`model`/`generated_at` from `season_recaps`. If neither exists, fail "Generate a summary first.". Set `edited_by`/`edited_at`.
  - publish: read the draft (fail if none), upsert it into `season_recaps` with `published: true` and `published_at: now`, then delete the draft.
  - unpublish: `update season_recaps set published=false`.
- [ ] **Step 3: Verify.** `bunx tsc --noEmit && bun run lint` are clean.
- [ ] **Step 4: Commit** `feat(recap): summary query and admin actions`

### Task 8: Summary UI + admin panel

**Files:**
- Create: `components/recap/RecapSummary.tsx` (server: `PostBody` + 13px note "Written with AI from league stats" + "· Edited by an admin" when `edited_at`)
- Create: `components/recap/SummaryAdmin.tsx` (client)
- Modify: `app/seasons/[slug]/recap/page.tsx` (replace the `{/* AI summary (PR 2) goes here */}` placeholder, using `id="summary"`)

**Interfaces:** `SummaryAdmin({ slug, published, draft }: { slug: string; published: RecapSummaryRow | null; draft: RecapSummaryRow | null })`

- [ ] **Step 1: Build the components.**
  - Section title is "The story of the season" with eyebrow "Season summary".
  - Non-admins see `RecapSummary` only when `published?.published`. With no published summary the section is omitted, and so is its jump chip.
  - Admins (`getSessionIfRole(["admin"])`) always get the section, with `SummaryAdmin` on top. Its states follow the spec:
    - none: "Generate summary"
    - draft: "Draft — not visible to the league", Edit, Regenerate, Publish
    - published with no draft: Edit, Regenerate, Unpublish
    - published with a draft: "Unpublished changes", Publish
  - Edit opens a textarea (`min-h` ~ 16 lines) with a live `PostBody` preview below it on mobile and beside it at `lg`.
  - Above Publish, show `numbersNotInFacts` as an amber warning: "Not found in the stats: 99, 14 — check before publishing".
  - Buttons use `ActionForm`/`SubmitButton` patterns where they fit. Pending states disable buttons. Generate can take ~20s, so show "Writing…".
  - Admins see the draft text in the preview area. They see the published text when there is no draft.
- [ ] **Step 2: Browser verification (390 first, then 1440)** on local Spring 2026 with `OPENROUTER_API_KEY` in `.env.local`:
  - as admin: Generate → draft shown with the not-visible banner
  - logged out: no section
  - Edit + save → "Edited by an admin" after publish
  - Publish → logged out sees it
  - Regenerate → logged out still sees the old text (Review Focus 4)
  - Unpublish → gone for logged out
  - Spot-check the summary's numbers against standings and stats
  - No horizontal overflow; buttons ≥44px
- [ ] **Step 3: Run** `bun run test && bunx tsc --noEmit && bun run lint && bun run build`. Expected: all clean.
- [ ] **Step 4: Commit** `feat(recap): AI season summary on the recap page`
