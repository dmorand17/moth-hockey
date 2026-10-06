#!/usr/bin/env bash
set -euo pipefail

# Run the dev server so other devices on the same Wi-Fi (phone, tablet) can load
# it. Two things differ from `bun dev`:
#   1. Next binds to 0.0.0.0 instead of localhost.
#   2. NEXT_PUBLIC_SUPABASE_URL is rewritten to this machine's LAN IP, because
#      the browser on your phone resolves 127.0.0.1 to the phone itself.
#
# The IP is detected at launch, so a new DHCP lease doesn't need a config edit.
# Nothing is written to .env.local — the override lives only in this process.

DEPENDENCIES=(bun route ipconfig)
SCRIPT_NAME=$(basename "$0")
PORT="${PORT:-3001}"
SUPABASE_PORT="${SUPABASE_PORT:-54321}"

log_info()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO  $*"; }
log_warn()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN  $*"; }
log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR $*" >&2; }

function usage() {
    cat <<EOF

Start the Next dev server on the LAN so you can test from a phone.

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    -i, --ip ADDRESS    Use this LAN IP instead of auto-detecting
    -h, --help          Show this help message

Environment:
    PORT                Dev server port (default: 3001)
    SUPABASE_PORT       Local Supabase API port (default: 54321)

Dependencies: ${DEPENDENCIES[*]}

Examples:
    ${SCRIPT_NAME}
    ${SCRIPT_NAME} --ip 192.168.68.57
    PORT=3002 ${SCRIPT_NAME}

EOF
    exit 0
}

function main() {
    local lan_ip=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
        -i | --ip) lan_ip="$2"; shift 2 ;;
        -h | --help) usage ;;
        *) log_error "Unknown option: $1"; usage ;;
        esac
    done

    exit_on_missing_tools "${DEPENDENCIES[@]}"

    [[ -z "$lan_ip" ]] && lan_ip=$(detect_lan_ip)
    if [[ -z "$lan_ip" ]]; then
        log_error "Could not detect a LAN IP. Pass one with --ip."
        exit 1
    fi

    warn_if_supabase_unreachable "$lan_ip"

    log_info "Open this on your phone: http://${lan_ip}:${PORT}"
    log_info "Supabase for client-side calls: http://${lan_ip}:${SUPABASE_PORT}"

    NEXT_PUBLIC_SUPABASE_URL="http://${lan_ip}:${SUPABASE_PORT}" \
    NEXT_PUBLIC_SITE_URL="http://${lan_ip}:${PORT}" \
        bun x next dev -p "$PORT" -H 0.0.0.0
}

# The interface holding the default route is the one the phone shares, which is
# more reliable than assuming en0 (Ethernet adapters and VPNs shuffle the order).
function detect_lan_ip() {
    local iface
    iface=$(route -n get default 2>/dev/null | awk '/interface: /{print $2}')
    [[ -n "$iface" ]] && ipconfig getifaddr "$iface" 2>/dev/null && return 0

    local candidate
    for candidate in en0 en1 en2; do
        ipconfig getifaddr "$candidate" 2>/dev/null && return 0
    done
    return 0
}

# Supabase binds 0.0.0.0 by default, but a firewall prompt that was dismissed
# leaves the port unreachable from the phone — and the failure looks like an
# empty page rather than an error.
function warn_if_supabase_unreachable() {
    local lan_ip="$1"
    if ! curl -fsS -m 3 -o /dev/null "http://${lan_ip}:${SUPABASE_PORT}/rest/v1/" 2>/dev/null; then
        log_warn "Local Supabase isn't answering on ${lan_ip}:${SUPABASE_PORT}."
        log_warn "Start it with 'bunx supabase start', and allow incoming connections if macOS asks."
    fi
}

function exit_on_missing_tools() {
    for cmd in "$@"; do
        command -v "$cmd" &>/dev/null || { log_error "'$cmd' not found"; exit 1; }
    done
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi
