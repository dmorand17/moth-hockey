# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js 16 + React 19

This project uses **Next.js 16.2.6** and **React 19.2.4**. Both have breaking changes vs. older versions you may have been trained on. Before writing any Next.js code, consult the local docs in `node_modules/next/dist/docs/` rather than relying on memory — APIs, conventions, and file structure differ. Honor any deprecation notices you encounter there.

## Package Manager

Uses **bun** (see `bun.lock`). Use `bun install` / `bun add` rather than npm or yarn. The `package.json` declares `sharp` and `unrs-resolver` as `trustedDependencies` and lists them in `ignoreScripts` — preserve that arrangement when modifying dependencies.

## Commands

- `bun dev` — start the dev server (Next.js, defaults to http://localhost:3000)
- `bun run build` — production build
- `bun start` — run the production build
- `bun run lint` — ESLint (flat config in `eslint.config.mjs`, extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`)

No test runner is configured.

## Architecture

App Router project (`app/` directory). Currently a stock `create-next-app` scaffold with one route:

- `app/layout.tsx` — root layout. Loads Geist Sans/Mono via `next/font/google` as CSS variables (`--font-geist-sans`, `--font-geist-mono`); sets `<html>` to `h-full antialiased` and `<body>` to `min-h-full flex flex-col` so child pages can size against viewport height.
- `app/globals.css` — Tailwind v4 entrypoint (PostCSS plugin in `postcss.config.mjs`). Tailwind v4 is configured via CSS, not `tailwind.config.*`.
- `app/page.tsx` — landing page.

TypeScript path alias `@/*` → repo root (see `tsconfig.json`).
