# M.O.T.H Hockey — Docs

## Reference (current state)

- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack, directory layout, rendering/data flow, Supabase client split, auth & roles.
- [DATABASE.md](./DATABASE.md) — schema from the migrations: enums, tables, RLS, helper functions, triggers.
- [DEVELOPMENT.md](./DEVELOPMENT.md) — dev workflow: bun commands, the Supabase migrations loop, conventions.
- [LOCAL-TESTING.md](./LOCAL-TESTING.md) — run locally and sign in as the seeded test users (magic link via Mailpit).

## Build plans (`initial-build/`)

- [PLAN.md](./initial-build/PLAN.md) — master build plan: scope, data model, routes, roles/permissions, Phase 1/2 checklists. Living source of truth.
- [MULTI-ROLE.md](./initial-build/MULTI-ROLE.md) — design + migration plan for many-to-many user roles. Not yet implemented.
- [MOBILE-PLAN.md](./initial-build/MOBILE-PLAN.md) — mobile-first punch list. Complete.
- [DEPLOY.md](./initial-build/DEPLOY.md) — deploy to Vercel + Supabase cloud.
