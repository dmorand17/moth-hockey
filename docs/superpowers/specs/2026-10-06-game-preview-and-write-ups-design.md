# Game Preview, Matchup Analyzer & AI Write-ups — Design

**Date:** 2026-10-06
**Status:** Approved 2026-10-06. Implementation plan: `docs/superpowers/plans/2026-10-06-game-preview-and-write-ups.md`.
**Issue:** #19

## Problem

Selecting an upcoming game shows only the schedule and check-ins — no context
on the teams, their form, or how the matchup projects. After a game there's a
box score but no story. #19 asks for a preview/matchup panel; this design also
adds an AI-written preview before each game and a recap after it.

## Goal

1. **Preview panel** on `/games/[id]` for scheduled games: recent form, top
   scorers, projected rosters, a key matchup, and fun projections (over/under,
   moneyline). Computed live, no AI.
2. **Preview write-up**: a ~150-word AI-written preview, generated the day
   before the game.
3. **Recap write-up**: a ~150-word AI-written recap, generated within minutes
   of the scorekeeper finalizing the game.

Admins can edit or hide any write-up.

## Out of scope

- Captain-added subs (separate feature, separate spec). Previews list lined-up
  subs once that ships; recaps already see subs via `game_appearances`.
- Betting of any kind. Projections are presented for fun.
- Write-ups for imported historical seasons (no event data).
- Playoff-specific framing beyond what the data says (a later increment).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Who writes the text | AI model via **OpenRouter** | Lets the model be swapped by env var with no deploy. |
| Default model | **`openai/gpt-6-luna`**, reasoning `low` | Won the 2026-10-06 bake-off: no factual errors in the recap, best narrative, ~$0.0002 per write-up. |
| Fallback model | **`google/gemini-2.5-flash-lite`** | Also error-free in the bake-off, same price tier. |
| Where it runs | Next.js on Vercel (Vercel Cron + `after()`) | One codebase; stats code shared by the panel and the prompt. |
| Preview timing | Daily cron; generate for games starting in the next 36h | "Day before game night", tolerant of schedule changes. |
| Recap timing | `after()` in `finalizeGame`, daily cron as backstop | Recap is up before players leave the rink; a failed call retries next day. |
| Publishing | Auto-publish; admins can edit/hide | Low effort, with an escape hatch. |
| Re-runs | Never overwrite an existing write-up | Admin edits survive. Regeneration is an explicit admin action. |

## Architecture

```
lib/matchup.ts        pure stats: form, scorers, rosters, key matchup, projection
   │
   ├──► app/games/[id]  PreviewPanel (scheduled games) — renders live
   │
   └──► lib/write-ups.ts  builds the model input, calls OpenRouter, stores result
           ▲                         ▲
           │                         │
  app/api/cron/write-ups      finalizeGame → after()
  (Vercel Cron, daily)        (recap only)
```

### 1. Stats module — `lib/matchup.ts`

Pure functions over already-fetched rows. No database access inside, so the
logic can be checked against fixed inputs.

- `teamForm(games, teamId, before)` → GP, W-L-OTL, points, GF/GA and per-game
  rates, and `lastThreeMostRecentFirst` (explicit ordering, see bake-off
  findings).
- `topScorers(events, teamId, n = 2)`.
- `projectedRoster(roster, availability, subs)` → in and out (names),
  no-response count, rostered goalie, lined-up subs.
- `gameLineup(appearances, teamId)` → skaters dressed, goalie, subs (for
  recaps).
- `keyMatchup(home, away)` → the team's top scorer against the opposing
  rostered goalie (by GA per game). A simple, explainable rule.
- `projectMatchup(homeForm, awayForm)` → Poisson model:
  - expected goals: `λ_home = (home.gf_per_game + away.ga_per_game) / 2`, and
    the mirror for away;
  - win probability over a 15×15 score grid, with ties split evenly (OT);
  - over/under line `floor(λ_home + λ_away) + 0.5`;
  - American moneyline from the win probability.

Minimum sample: below 2 games played for either team, projections are
omitted and the panel shows "Projections start after week 2".

### 2. Preview panel

A server component on `/games/[id]`, shown only when `status = 'scheduled'`,
under the availability cards. Sections: Form · Top scorers · Projected
rosters · Key matchup · Projection. The projection is labeled "For fun — not
betting advice". If a preview write-up exists and isn't hidden, it sits at the
top of the panel.

A recap write-up, when present, shows at the top of the final-game view.

### 3. Data model — migration `0023_game_write_ups.sql`

```sql
create type write_up_kind as enum ('preview', 'recap');

create table game_write_ups (
  game_id      uuid not null references games(id) on delete cascade,
  kind         write_up_kind not null,
  headline     text not null,
  body         text not null,
  model        text not null,          -- e.g. 'openai/gpt-6-luna'
  generated_at timestamptz not null default now(),
  edited_at    timestamptz,
  edited_by    uuid references auth.users(id),
  hidden       boolean not null default false,
  primary key (game_id, kind)
);

alter table game_write_ups enable row level security;

create policy "public read visible write-ups" on game_write_ups for select
  using (not hidden or public.current_user_role() = 'admin');

create policy "admins manage write-ups" on game_write_ups for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
```

Generation writes through a **server-only service-role client**
(`lib/supabase/service.ts`, reading `SUPABASE_SECRET_KEY`). The cron route has
no user session, and the recap in `after()` runs as a scorekeeper, who should
not get write access to this table. This is the app's first service-role
client: it must be imported only from server code (`import "server-only"`).

Inserts use `on conflict (game_id, kind) do nothing`, which enforces "never
overwrite" at the database level.

### 4. Generation — `lib/write-ups.ts`

- `buildPreviewInput(gameId)` / `buildRecapInput(gameId)` → the JSON contract
  below, built from `lib/matchup.ts`.
- `generateWriteUp(kind, input)` → one `POST
  https://openrouter.ai/api/v1/chat/completions` with `fetch` (OpenRouter is
  OpenAI-compatible; no SDK needed). Body: `model`, system + user messages,
  `max_tokens: 1000`, `reasoning: { effort: "low" }`, `usage: { include: true }`.
  On failure, retry once on `WRITE_UP_FALLBACK_MODEL`.
- Output parsing: first line is the headline, the rest is the body. Reject and
  log (don't store) output that is empty, under 60 words, or over 250 words.
- Logs model, token counts and the `usage.cost` returned by OpenRouter.

**Input contract** (field names matter; the bake-off showed models misread
unlabeled data):

- Preview: `game { home, away, when }`; per team: `record`, `points`, `gp`,
  `goals_for`, `goals_against`, `gf_per_game`, `ga_per_game`,
  `last_3_most_recent_first`, `top_scorers`, `rostered_goalie`,
  `availability { roster_size, checked_in, out, out_key_players[], no_response }`
  — counts, plus names only for absent top scorers / the rostered goalie, so the
  model can't name anyone else who's out — and `subs_lined_up[]` from `game_subs`;
  `projection { expected_goals_*, over_under_line, win_probability_*,
  moneyline_* }`.
- Recap: `game { home, away, played_on, final, decided_in }`; `goals[]` in
  order with `period`, `time_remaining`, `team`, `scorer`, `scorer_is_sub`,
  `assists`, `score_after`; `penalties[]`; `records_after`; per team
  `lineup { skaters_dressed, goalie, subs[] }` from `game_appearances`
  (`is_sub = true` → `subs[]`).

**System prompt:** the bake-off prompt (fun, PG, league-newsletter tone; only
facts from the JSON; never mock an individual; projections are for fun; say
"rosters TBD" when few have checked in; 120–160 words; headline then plain
prose), plus rules for the new data:

- *Don't summarize a streak or pattern unless every game in it fits.* (From the
  bake-off.)
- *Previews:* name a player who's **out** only if they're a top scorer or the
  rostered goalie, and never guess why. Otherwise use counts ("two Ravens are
  out"). Name subs who are lined up.
- *Recaps:* credit a sub who scored or assisted as a sub ("sub Kai Hale set up
  the equalizer"). Mention a short bench only when it's notable (fewer than 7
  skaters dressed).

### 5. Triggers

- **`vercel.json` cron**: daily at `0 18 * * *` (18:00 UTC — Vercel Cron
  schedules are UTC; 2 PM Eastern in summer, 1 PM in winter), calling
  `GET /api/cron/write-ups`. The route checks
  `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this automatically) and
  returns 401 otherwise.
  - Previews: scheduled games starting in the next 36 hours with no preview
    row. 36h rather than 24–30h so a Sunday-evening game is still caught by
    Saturday's run (games land just after midnight UTC).
  - Recaps: final games from the last 7 days with no recap row (backstop).
  - Processes games one at a time and continues past failures.
- **`finalizeGame`** (`app/score/[gameId]/actions.ts`): after the game is
  marked final, `after(() => generateAndStore("recap", gameId))`. Finalize
  stays instant; a failure here is retried by the next cron run.

### 6. Admin controls

On `/games/[id]`, admins see **Edit**, **Hide/Show** and **Regenerate** on
each write-up. Edit sets `edited_at`/`edited_by`. Regenerate deletes the row
and generates fresh output (with a confirm dialog), since it discards edits.

## Error handling

| Failure | Behavior |
|---|---|
| OpenRouter error / timeout | Retry once on fallback model; else log and skip. Next cron retries. |
| Output fails validation | Not stored; logged with the model ID; next cron retries. |
| Both models fail repeatedly | Section simply doesn't render. Nothing else on the page changes. |
| Missing `OPENROUTER_API_KEY` | Cron returns 500 with a clear message; page unaffected. |
| Cron called without secret | 401. |

## Environment

| Variable | Where | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Vercel (prod + preview), `.env.local` | Already in `.env.local`. |
| `WRITE_UP_MODEL` | Vercel | Default `openai/gpt-6-luna`. |
| `WRITE_UP_FALLBACK_MODEL` | Vercel | Default `google/gemini-2.5-flash-lite`. |
| `SUPABASE_SECRET_KEY` | Vercel, `.env.local` | Server-only. Never `NEXT_PUBLIC_`. |
| `CRON_SECRET` | Vercel | Generated; Vercel attaches it to cron calls. |

The OpenRouter workspace guardrails must allow the OpenAI and Google providers
under its ZDR policy. That was configured during the bake-off.

## Cost

About 3 games a week × (preview + recap) ≈ 300 write-ups a year. At
~$0.0002 each on GPT-6 Luna, that's roughly **$0.06 a year**. Even on
Claude Sonnet 5.5 it would be about $3 a year.

## Prerequisite: fix the sample seed

`scripts/local/seed-sample.ts` produces data that breaks write-ups:

1. **Duplicate names** — 45 players share 24 names because the name list
   cycles, so the same name appears on several teams. Make names unique per
   season.
2. **OT games have no OT goal** — goals are placed in periods 1–3 only. For
   `decided_in = 'ot'`, regulation should end tied and the winner should score
   in period 4.

3. **No subs** — add one or two `is_sub` appearances (with a goal or assist)
   to a few final games so the recap's sub handling can be tested.

Without these, local testing of recaps produces confusing output.

## Verification

No test runner is configured, so:

- `lib/matchup.ts` and output validation are pure functions, checked with a
  small Bun script against fixed seeded inputs. Expected values (records,
  last-3 order, Poisson numbers) are asserted against SQL computed
  independently, as in the bake-off.
- End-to-end locally: run the cron route with the secret and check the
  preview row; finalize a game in `/score` and check the recap row appears
  within a minute; confirm admin edit/hide/regenerate; confirm a hidden
  write-up isn't visible to a signed-out user.
- Fact-check each generated write-up from local runs against its input JSON
  before shipping.
- Typecheck, lint and build pass.

## Bake-off record (2026-10-06)

Same prompt and inputs (one preview, one regulation recap from seeded data).

| Model | Result |
|---|---|
| GPT-6 Luna (reasoning low) | Recap error-free; preview had one fuzzy streak phrase. Best tone. $0.0002 |
| Gemini 2.5 Flash-Lite | Error-free on both. Decent tone. $0.0002 |
| GPT-5 mini | One timing error; stat-heavy; quoted moneyline. $0.0008 |
| Gemini 2.5 Flash | Error-free; flat, preview short. $0.0007 |
| Claude Haiku 4.5 | First round only (pre-fix inputs): misread result order, invented a weekday. $0.0019 |
| Claude Sonnet 5.5, Qwen3.7 Flash, DeepSeek, Mistral Small | Not run (key credit, guardrails, provider error) |

The first round showed that unlabeled ordering and a missing date both
produced errors; the input contract above fixes both.
