#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
SERVER_PID_FILE="$RUN_DIR/server.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
SILENT="${1:-}"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  rm -f "$pid_file"

  if [[ -z "$pid" ]]; then
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 0.2
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    if [[ "$SILENT" != "--silent" ]]; then
      echo "Stopped $label (pid $pid)"
    fi
  fi
}

stop_port() {
  local port="$1"
  local ids
  ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$ids" ]]; then
    return 0
  fi

  # shellcheck disable=SC2086
  kill $ids >/dev/null 2>&1 || true
  sleep 0.2
  ids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$ids" ]]; then
    # shellcheck disable=SC2086
    kill -9 $ids >/dev/null 2>&1 || true
  fi

  if [[ "$SILENT" != "--silent" ]]; then
    echo "Cleared listeners on port $port"
  fi
}

stop_pid_file "$SERVER_PID_FILE" "server"
stop_pid_file "$WEB_PID_FILE" "web"

stop_port 3000
stop_port 3001
stop_port 8080

if [[ "$SILENT" != "--silent" ]]; then
  echo "All local ZYM services are stopped."
fi
