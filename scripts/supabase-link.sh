#!/usr/bin/env bash
set -euo pipefail

# Link this repo to the staging or production Supabase project, non-interactively,
# from environment variables. Wraps `supabase link` so you don't paste refs or
# passwords by hand (and can't fat-finger the wrong project).
#
# Load the matching per-environment file first, e.g.:
#   set -a; source .env.staging; set +a
#   ./scripts/supabase-link.sh staging

DEPENDENCIES=(bunx)
SCRIPT_NAME=$(basename "$0")

# Baked-in refs (see docs/SUPABASE.md); SUPABASE_PROJECT_REF overrides.
STAGING_REF_DEFAULT="ecvktaljsvrecozmfayj"
PROD_REF_DEFAULT="fpvqzzkauhifixnzppwh"

log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO  $*"; }
log_warn()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN  $*"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR $*" >&2; }

function usage() {
    cat <<EOF

Link this repo to a Supabase cloud project using environment variables.

Usage: ${SCRIPT_NAME} <staging|prod> [OPTIONS]

Arguments:
    staging | prod          Which project to link (prod requires confirmation)

Options:
    -y, --yes               Skip the production confirmation prompt (for CI)
    -h, --help              Show this help message

Environment (load the matching per-env file first: source .env.staging):
    SUPABASE_ACCESS_TOKEN   Personal access token (required)
                            Create one at https://supabase.com/dashboard/account/tokens
    SUPABASE_DB_PASSWORD    Database password for the target project (required)
    SUPABASE_PROJECT_REF    Project ref (optional; defaults per target)
    SUPABASE_ENV            staging|production (optional; cross-checked vs the
                            target argument to catch a wrong sourced file)

Dependencies: ${DEPENDENCIES[*]}

Examples:
    set -a; source .env.staging; set +a && ${SCRIPT_NAME} staging
    set -a; source .env.production; set +a && ${SCRIPT_NAME} prod --yes

EOF
    exit "${1:-0}"
}

function main() {
    local target=""
    local assume_yes=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
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

    # Guard against sourcing the wrong per-env file (e.g. .env.production loaded
    # but you asked to link staging).
    if [[ -n "${SUPABASE_ENV:-}" && "${SUPABASE_ENV}" != "$target" ]]; then
        log_error "Loaded env is SUPABASE_ENV='${SUPABASE_ENV}' but target is '$target'."
        log_error "Source the matching file (.env.${target}) or fix the target."
        exit 1
    fi

    : "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)}"
    : "${SUPABASE_DB_PASSWORD:?set SUPABASE_DB_PASSWORD (from .env.${target})}"

    local default_ref ref
    if [[ "$target" == "production" ]]; then
        default_ref="$PROD_REF_DEFAULT"
    else
        default_ref="$STAGING_REF_DEFAULT"
    fi
    ref="${SUPABASE_PROJECT_REF:-$default_ref}"

    [[ "$target" == "production" ]] && confirm_production "$ref" "$assume_yes"

    link_project "$target" "$ref"
}

function confirm_production() {
    local ref="$1" assume_yes="$2"

    if [[ "$assume_yes" == true ]]; then
        log_warn "Linking PRODUCTION ($ref) — confirmation skipped via --yes."
        return 0
    fi

    log_warn "You are about to link the PRODUCTION project ($ref)."
    read -r -p "Type 'prod' to confirm: " reply
    [[ "$reply" == "prod" ]] || { log_error "Confirmation failed — aborting."; exit 1; }
}

function link_project() {
    local target="$1" ref="$2"

    log_info "Linking $target project ($ref)…"
    # SUPABASE_ACCESS_TOKEN is read from the environment by the CLI. Pass the
    # password via --password so linking is non-interactive; it is never logged.
    if ! bunx supabase link --project-ref "$ref" --password "$SUPABASE_DB_PASSWORD"; then
        log_error "supabase link failed for $target ($ref)."
        exit 1
    fi

    log_info "Linked to $target ($ref). Verify before any db push/reset:"
    log_info "  bunx supabase projects list"
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
