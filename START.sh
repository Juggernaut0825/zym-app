#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
SERVER_LOG="$ROOT_DIR/server.log"
WEB_LOG="$ROOT_DIR/web.log"
SERVER_PID_FILE="$RUN_DIR/server.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
MODE="${1:-dev}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "Usage: ./START.sh [dev|prod]"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/server" || ! -d "$ROOT_DIR/web" ]]; then
  echo "Error: run this script from zym-app root directory"
  exit 1
fi

mkdir -p "$RUN_DIR"

cleanup_port() {
  local port="$1"
  local ids
  ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$ids" ]]; then
    echo "Stopping existing listeners on port $port: $ids"
    # shellcheck disable=SC2086
    kill $ids >/dev/null 2>&1 || true
    sleep 0.3
    ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "$ids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $ids >/dev/null 2>&1 || true
    fi
  fi
}

wait_for_health() {
  local url="$1"
  local name="$2"
  local attempts=40

  for ((i=1; i<=attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name is ready"
      return 0
    fi
    sleep 0.5
  done

  echo "Error: $name did not become ready ($url)"
  return 1
}

echo "Preparing to start ZYM ($MODE mode)..."

"$ROOT_DIR/STOP.sh" --silent || true
cleanup_port 3000
cleanup_port 3001
cleanup_port 8080

if [[ "$MODE" == "prod" ]]; then
  echo "Building server and web for production..."
  (cd "$ROOT_DIR/server" && npm run build)
  (cd "$ROOT_DIR/web" && npm run build)
  SERVER_CMD="npm run start"
  WEB_CMD="npm run start -- -p 3000"
else
  SERVER_CMD="npm run dev"
  WEB_CMD="npm run dev"
fi

echo "Starting server..."
(
  cd "$ROOT_DIR/server"
  nohup bash -lc "$SERVER_CMD" >"$SERVER_LOG" 2>&1 &
  echo $! > "$SERVER_PID_FILE"
)
wait_for_health "http://127.0.0.1:3001/health" "Server"

echo "Starting web app..."
(
  cd "$ROOT_DIR/web"
  nohup bash -lc "$WEB_CMD" >"$WEB_LOG" 2>&1 &
  echo $! > "$WEB_PID_FILE"
)
wait_for_health "http://127.0.0.1:3000/" "Web app"

echo ""
echo "ZYM started successfully."
echo "  Web:       http://localhost:3000"
echo "  API:       http://localhost:3001"
echo "  WebSocket: ws://localhost:8080"
echo ""
echo "Logs:"
echo "  tail -f $SERVER_LOG"
echo "  tail -f $WEB_LOG"
echo ""
echo "Stop all services:"
echo "  ./STOP.sh"
