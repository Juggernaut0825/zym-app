#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  bash ./infra/scripts/smoke-check-prod.sh [--web-only|--backend-only] [--github-output <path>] [--alb-dns-name <dns>]

Examples:
  bash ./infra/scripts/smoke-check-prod.sh
  bash ./infra/scripts/smoke-check-prod.sh --backend-only
  bash ./infra/scripts/smoke-check-prod.sh --github-output "$GITHUB_OUTPUT"
EOF
}

PROD_ALB_DNS_NAME="${PROD_ALB_DNS_NAME:-zym-app-alb-1098890527.us-east-2.elb.amazonaws.com}"
CHECK_WEB="true"
CHECK_BACKEND="true"
GITHUB_OUTPUT_PATH="${GITHUB_OUTPUT:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --web-only)
      CHECK_WEB="true"
      CHECK_BACKEND="false"
      ;;
    --backend-only)
      CHECK_WEB="false"
      CHECK_BACKEND="true"
      ;;
    --github-output)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for --github-output" >&2
        usage
        exit 1
      fi
      GITHUB_OUTPUT_PATH="$1"
      ;;
    --alb-dns-name)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for --alb-dns-name" >&2
        usage
        exit 1
      fi
      PROD_ALB_DNS_NAME="$1"
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

api_status="skipped"
ws_status="skipped"
web_status="skipped"

if [ "${CHECK_BACKEND}" = "true" ]; then
  curl -skf -H "Host: api.zym8.com" "https://${PROD_ALB_DNS_NAME}/health" > "$TMPDIR/api-health.json"
  curl -skf -H "Host: ws.zym8.com" "https://${PROD_ALB_DNS_NAME}/health" > "$TMPDIR/ws-health.json"

  api_status="$(jq -r '.ok as $ok | "ok=\($ok) database=\(.runtime.providers.database) redis=\(.dependencies.redis.ok) rateLimit=\(.runtime.providers.rateLimit)"' "$TMPDIR/api-health.json")"
  ws_status="$(jq -r '.ok as $ok | "ok=\($ok) websocket=\(.runtime.roles.websocket) redis=\(.dependencies.redis.ok)"' "$TMPDIR/ws-health.json")"
fi

if [ "${CHECK_WEB}" = "true" ]; then
  curl -skf -H "Host: app.zym8.com" "https://${PROD_ALB_DNS_NAME}/" -o "$TMPDIR/app.html"
  grep -qi "<!DOCTYPE html" "$TMPDIR/app.html"
  web_status="ok html_bytes=$(wc -c < "$TMPDIR/app.html" | tr -d ' ')"
fi

echo "API: ${api_status}"
echo "WS: ${ws_status}"
echo "Web: ${web_status}"

if [ -n "${GITHUB_OUTPUT_PATH}" ]; then
  {
    echo "api_status=${api_status}"
    echo "ws_status=${ws_status}"
    echo "web_status=${web_status}"
  } >> "${GITHUB_OUTPUT_PATH}"
fi
