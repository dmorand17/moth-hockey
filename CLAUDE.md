# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Project docs live in `docs/` — [`docs/README.md`](docs/README.md) is the index. Consult these before diving into code:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, directory layout, rendering/data-flow model, Supabase client split, auth & roles.
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, enums, RLS, helper functions, and triggers (built from the migrations).
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — dev workflow, the Supabase migrations loop, and conventions.
- [`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md) — run locally and sign in as the seeded test users (magic link via Mailpit).
- [`docs/initial-build/`](docs/initial-build/) — build plans: `PLAN.md` (master source of truth), `MULTI-ROLE.md`, `MOBILE-PLAN.md`, `DEPLOY.md`.

## Critical: Next.js 16 + React 19

This project uses **Next.js 16.2.6** and **React 19.2.4**. Both have breaking changes vs. older versions you may have been trained on. Before writing any Next.js code, consult the local docs in `node_modules/next/dist/docs/` rather than relying on memory — APIs, conventions, and file structure differ. Honor any deprecation notices you encounter there.

## Package Manager

Uses **bun** (see `bun.lock`). Use `bun install` / `bun add` rather than npm or yarn. Use `bunx` instead of `npx` for running local binaries (e.g. `bunx supabase`). The `package.json` declares `sharp` and `unrs-resolver` as `trustedDependencies` and lists them in `ignoreScripts` — preserve that arrangement when modifying dependencies.

## Commands

- `bun dev` — start the dev server (Next.js, defaults to http://localhost:3000)
- `bun run build` — production build
- `bun start` — run the production build
- `bun run lint` — ESLint (flat config in `eslint.config.mjs`, extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`)

No test runner is configured.

## Architecture

App Router project (`app/`) backed by Supabase (Postgres / Auth). Server-first: pages are React Server Components that read via `lib/queries.ts`; mutations live in colocated `actions.ts` server actions gated by `lib/auth.ts`. Tailwind v4 is configured in `app/globals.css`, not `tailwind.config.*`. TypeScript path alias `@/*` → repo root.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full directory layout, data-flow model, and Supabase client split, and [`docs/DATABASE.md`](docs/DATABASE.md) for the schema.
