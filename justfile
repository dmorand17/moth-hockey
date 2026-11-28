# Common commands. Run `just` to list them.

default:
    @just --list

# Install dependencies
install:
    bun install

# Dev server on http://127.0.0.1:3001
dev:
    bun dev

# Dev server reachable from other devices on your Wi-Fi
dev-lan:
    bun run dev:lan

# Production build
build:
    bun run build

# Serve the production build
start:
    bun start

# ESLint
lint:
    bun run lint

# Unit tests over lib/
test:
    bun run test

# Lint + test
check: lint test

# Start the local Supabase stack (Postgres/Auth/Studio/Mailpit)
db-start:
    bunx supabase start

# Stop the local Supabase stack
db-stop:
    bunx supabase stop

# Print local Supabase URLs, ports, and keys
db-status:
    bunx supabase status

# Apply migrations and reseed the local database
db-reset:
    bunx supabase db reset

# Create a new migration file
db-migration name:
    bunx supabase migration new {{name}}

# Regenerate TypeScript types from the local schema
db-types:
    bunx supabase gen types typescript --local > lib/supabase/database.types.ts

# Reseed the local current season (e.g. `just seed-sample 4`, `just seed-sample 5 --complete`)
seed-sample count="5" *args:
    scripts/local/seed-sample.sh {{count}} {{args}}

# Push migrations to a cloud project (e.g. `just db-push staging --dry-run`)
db-push target *args:
    scripts/supabase-push.sh {{target}} {{args}}
