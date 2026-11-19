#!/usr/bin/env bash
set -euo pipefail

# Push pending migrations to the staging or production Supabase project.
# Links the target's baked-in ref first on every run, so a push can never land
# on whichever project happened to be linked before.
#
# If SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD isn't already set, the
# matching per-environment file (.env.staging or .env.production) is loaded
# automatically — only inside this script, so secrets never leak into your shell:
#   ./scripts/supabase-push.sh staging --dry-run

DEPENDENCIES=(bunx)
SCRIPT_NAME=$(basename "$0")
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

# Baked-in refs (see docs/SUPABASE.md); SUPABASE_PROJECT_REF overrides.
STAGING_REF_DEFAULT="ecvktaljsvrecozmfayj"
PROD_REF_DEFAULT="fpvqzzkauhifixnzppwh"

log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO  $*"; }
log_warn()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN  $*"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR $*" >&2; }

function usage() {
    cat <<EOF

Link a Supabase cloud project and push pending migrations to it.

Usage: ${SCRIPT_NAME} <staging|prod> [OPTIONS]

Arguments:
    staging | prod          Which project to push to (prod requires confirmation)

Options:
    -n, --dry-run           Show which migrations would be applied; change nothing
    -y, --yes               Skip the production confirmation prompt (for CI)
    -h, --help              Show this help message

Environment (read from the shell; if either secret is missing, the
matching .env.staging / .env.production in the repo root is loaded for you):
    SUPABASE_ACCESS_TOKEN   Personal access token (required). Needs Read on
                            Project Settings, API Keys, API Key Secrets and
                            Database Pooling Config.
                            Create one at https://supabase.com/dashboard/account/tokens
    SUPABASE_DB_PASSWORD    Database password for the target project (required)
    SUPABASE_PROJECT_REF    Project ref (optional; defaults per target)
    SUPABASE_ENV            staging|production (optional; cross-checked vs the
                            target argument to catch a wrong sourced file)

Dependencies: ${DEPENDENCIES[*]}

Examples:
    ${SCRIPT_NAME} staging --dry-run       # loads .env.staging, lists pending migrations
    ${SCRIPT_NAME} staging                 # applies them
    ${SCRIPT_NAME} prod                    # loads .env.production, asks to confirm
    SUPABASE_ACCESS_TOKEN=... SUPABASE_DB_PASSWORD=... ${SCRIPT_NAME} prod --yes   # CI

EOF
    exit "${1:-0}"
}

function main() {
    local target=""
    local assume_yes=false
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
        -n | --dry-run) dry_run=true; shift ;;
        -y | --yes)  assume_yes=true; shift ;;
        -h | --help) usage 0 ;;
        staging | stage) target="staging"; shift ;;
        prod | production) target="production"; shift ;;
        *)
            log_error "Unknown argument: $1"
            usage 1
            ;;
        esac
    done

    [[ -z "$target" ]] && log_error "Target is required: staging or prod" && usage 1

    exit_on_missing_tools "${DEPENDENCIES[@]}"
    cd "$REPO_ROOT"   # the CLI reads supabase/ from the working directory

    if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" || -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
        load_env_file "$target"
    fi

    # Guard against sourcing the wrong per-env file (e.g. .env.production loaded
    # but you asked to link staging).
    if [[ -n "${SUPABASE_ENV:-}" && "${SUPABASE_ENV}" != "$target" ]]; then
        log_error "Loaded env is SUPABASE_ENV='${SUPABASE_ENV}' but target is '$target'."
        log_error "Fix SUPABASE_ENV in .env.${target} (or the exported env), or the target."
        exit 1
    fi

    : "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)}"
    : "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD (in .env.${target})}"

    local default_ref ref
    if [[ "$target" == "production" ]]; then
        default_ref="$PROD_REF_DEFAULT"
    else
        default_ref="$STAGING_REF_DEFAULT"
    fi
    ref="${SUPABASE_PROJECT_REF:-$default_ref}"

    [[ "$target" == "production" ]] && confirm_production "$ref" "$assume_yes"

    link_project "$target" "$ref"
    push_migrations "$target" "$ref" "$dry_run"
}

# Export every variable from .env.<target> into this script's environment only.
function load_env_file() {
    local target="$1"
    local env_file="$REPO_ROOT/.env.$target"

    if [[ ! -f "$env_file" ]]; then
        log_error "SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD not set and $env_file not found."
        log_error "Copy .env.$target.example to .env.$target and fill it in, or export the variables."
        exit 1
    fi

    log_info "Loading $(basename "$env_file")…"
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
}

function confirm_production() {
    local ref="$1" assume_yes="$2"

    if [[ "$assume_yes" == true ]]; then
        log_warn "Pushing to PRODUCTION ($ref) — confirmation skipped via --yes."
        return 0
    fi

    log_warn "You are about to push migrations to the PRODUCTION project ($ref)."
    read -r -p "Type 'prod' to confirm: " reply
    [[ "$reply" == "prod" ]] || { log_error "Confirmation failed — aborting."; exit 1; }
}

function link_project() {
    local target="$1" ref="$2"

    log_info "Linking $target project ($ref)…"
    # SUPABASE_ACCESS_TOKEN is read from the environment by the CLI.
    if ! bunx supabase link --project-ref "$ref"; then
        log_error "supabase link failed for $target ($ref)."
        exit 1
    fi

    local linked
    linked=$(cat supabase/.temp/project-ref 2>/dev/null || true)
    if [[ "$linked" != "$ref" ]]; then
        log_error "Linked project is '${linked:-none}', expected $ref — aborting before push."
        exit 1
    fi
}

function push_migrations() {
    local target="$1" ref="$2" dry_run="$3"
    local args=(db push --remote)
    [[ "$dry_run" == true ]] && args+=(--dry-run)

    # --remote targets the linked project (CLI v3 defaults to the local stack).
    # SUPABASE_DB_PASSWORD is read from the environment by the CLI.
    log_info "Pushing migrations to $target ($ref)$([[ "$dry_run" == true ]] && echo " — dry run")…"
    if ! bunx supabase "${args[@]}"; then
        log_error "supabase db push failed for $target ($ref)."
        exit 1
    fi
}

function exit_on_missing_tools() {
    for cmd in "$@"; do
        if ! command -v "$cmd" &>/dev/null; then
            log_error "Required tool '$cmd' is not installed or not in PATH"
            exit 1
        fi
    done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi
