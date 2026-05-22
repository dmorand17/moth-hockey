# M.O.T.H Hockey — Progress

Living checklist. Update as work ships. See `PLAN.md` for full scope/decisions.

Last updated: 2026-05-22

---

## Phase 1 — MVP

### 1. Schema + seed data ✅
- [x] Supabase project (local Docker via colima)
- [x] Initial migration: seasons, teams, players, team_players, games, game_appearances, game_events, content_pages, account_requests, user_roles
- [x] Added Phase 2 columns now (`players.photo_url`, `teams.logo_url`) so no migration is needed later
- [x] `season_player_stats` table (pulled forward from Phase 2 for historical stats display)
- [x] `player_awards` table (Champion / MVP / MVD / Goon / Sniper / Playmaker / Vezina / Iron Man / Most Hat Tricks)
- [x] RLS policies for all tables
- [x] Seed data: 1 current + 2 historical seasons, 4 teams, 36 players, 5 games + events, 14 historical stat rows, 9 awards

### 2. Public read-only site ✅
- [x] Layout with M.O.T.H branding (Bebas/Inter/JetBrains Mono fonts, dark scoreboard theme)
- [x] `/` landing — hero scoreboard, standings preview, upcoming, recent results
- [x] `/standings` — full table with tiebreakers (pts → wins → diff → GF)
- [x] `/teams` and `/teams/[slug]` — roster grouped Forwards / Defense / Goalies
- [x] `/schedule` — chronological game list grouped by month
- [x] `/games/[id]` — boxscore with goal/penalty event log, OT/SO support
- [x] `/players/[id]` — career table per season + ALL-TIME totals + interactive award badges
- [x] `/stats` — league leaders (points, goals, assists, penalties, goalies)
- [x] `/about` hub + `/about/{rules,faq,league}` content pages
- [x] Mobile responsive (verified at 390px viewport)
- [x] No hydration errors

### 3. Admin CRUD ⬜ NEXT
- [ ] Auth wiring: `/login` (Supabase magic link), `/request-access` form, `/admin/users` approval queue
- [ ] Admin layout + role gating (RLS already in place; needs route-level guards too)
- [ ] CRUD: teams (create/edit, color picker, slug)
- [ ] CRUD: players (create/edit names, jersey numbers)
- [ ] CRUD: rosters (assign players to teams per season, set position)
- [ ] CRUD: schedule (create games, set status, manually enter scores)
- [ ] CRUD: content pages (markdown editor for rules / FAQ / league)
- [ ] CRUD: player awards (grant / revoke per season)
- [ ] Season management (start a new season)
- [ ] Verify: an admin can set up a real season end-to-end without SQL

### 4. Scorekeeper ⬜
- [ ] `/score` home (list assigned games)
- [ ] `/score/[gameId]` live UI: pre-game roster check-in, goal flow, penalty + penalty-shot flow, OT, shootout tally, undo, period advance
- [ ] Mobile-first one-handed UX
- [ ] Connectivity: requires internet (no offline queue per scope decision)

### 5. Realtime boxscore ⬜
- [ ] `/games/[id]` subscribes to Supabase Realtime channel
- [ ] Spectator updates within ~1s of scorekeeper input

### 6. Stats ✅
- [x] Per-player season stats derived inline (skater + goalie variants)
- [x] Standings derivation (points, tiebreakers)
- [x] League leaders on `/stats`
- [x] Historical stats display (live + imported, ALL-TIME totals)

### 7. Deploy ⬜
- [ ] Vercel project (Hobby / free)
- [ ] Supabase cloud project (free tier)
- [ ] Migrate local schema + seed to cloud
- [ ] Default `*.vercel.app` subdomain
- [ ] Test from a phone over LTE

---

## Phase 2 — Nice-to-have

- [ ] Photos via Cloudflare R2 (columns already exist; need upload UI + presigned URLs)
- [ ] CSV import for historical seasons (`/admin/import`)
- [ ] Season archive view `/seasons/[id]`
- [ ] Quality-of-life admin features (bulk schedule import, drag-to-reorder, player merge)
- [ ] Custom domain

---

## Notable decisions made along the way

- Seasons use `season_type` enum (`spring | fall | winter`) + `year`; running 3 seasons/year
- Positions: `forward | defense | goalie` (was originally just skater + goalie)
- Penalty shot result: `goal | saved` only (no missed)
- 5 forwards + 3 defense + 1 goalie per team is the seed convention
- Footer reads "Powered by the Milkman"; tagline reads "EST. PRE-COVID"
- Award types: champion, mvp, mvd, vezina, sniper, most_hat_tricks, playmaker, iron_man, goon
- Award badges are interactive: hover/click to see which seasons earned
- No SV% column for goalies — only PSF/PSV (since we only track penalty shots)
