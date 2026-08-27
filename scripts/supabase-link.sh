#!/usr/bin/env bash
set -euo pipefail

# Link this repo to the staging or production Supabase project, non-interactively,
# from environment variables. Wraps `supabase link` so you don't paste refs or
# passwords by hand (and can't fat-finger the wrong project).

DEPENDENCIES=(bunx)
SCRIPT_NAME=$(basename "$0")

# Known project refs (see docs/SUPABASE.md). Overridable via env for forks/tests.
STAGING_PROJECT_REF="${STAGING_PROJECT_REF:-ecvktaljsvrecozmfayj}"
PROD_PROJECT_REF="${PROD_PROJECT_REF:-fpvqzzkauhifixnzppwh}"

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

Environment:
    SUPABASE_ACCESS_TOKEN   Personal access token (required)
                            Create one at https://supabase.com/dashboard/account/tokens
    STAGING_DB_PASSWORD     Database password — required when linking staging
    PROD_DB_PASSWORD        Database password — required when linking prod
    STAGING_PROJECT_REF     Override the staging ref (default ${STAGING_PROJECT_REF})
    PROD_PROJECT_REF        Override the prod ref (default ${PROD_PROJECT_REF})

Dependencies: ${DEPENDENCIES[*]}

Examples:
    SUPABASE_ACCESS_TOKEN=sbp_… STAGING_DB_PASSWORD=… ${SCRIPT_NAME} staging
    SUPABASE_ACCESS_TOKEN=sbp_… PROD_DB_PASSWORD=…    ${SCRIPT_NAME} prod --yes

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
        prod | production) target="prod"; shift ;;
        *)
            log_error "Unknown argument: $1"
            usage 1
            ;;
        esac
    done

    [[ -z "$target" ]] && log_error "Target is required: staging or prod" && usage 1

    exit_on_missing_tools "${DEPENDENCIES[@]}"

    : "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)}"

    local ref db_password
    if [[ "$target" == "prod" ]]; then
        ref="$PROD_PROJECT_REF"
        db_password="${PROD_DB_PASSWORD:?set PROD_DB_PASSWORD to the prod database password}"
        confirm_production "$ref" "$assume_yes"
    else
        ref="$STAGING_PROJECT_REF"
        db_password="${STAGING_DB_PASSWORD:?set STAGING_DB_PASSWORD to the staging database password}"
    fi

    link_project "$target" "$ref" "$db_password"
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
    local target="$1" ref="$2" db_password="$3"

    log_info "Linking $target project ($ref)…"
    # SUPABASE_ACCESS_TOKEN is read from the environment by the CLI. Pass the
    # password via --password so linking is non-interactive; it is never logged.
    if ! bunx supabase link --project-ref "$ref" --password "$db_password"; then
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
