#!/usr/bin/env bash
# list-recent-media.sh - List recently available media
# Usage: bash scripts/list-recent-media.sh [--limit 5] [--active-only] [--json]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

python3 - "$SCRIPT_DIR" "$@" << 'PY'
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

script_dir = Path(sys.argv[1])
sys.path.insert(0, str(script_dir))

from media_common import get_session_file, load_json, load_media_index  # noqa: E402


parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, default=5)
parser.add_argument("--active-only", action="store_true")
parser.add_argument("--json", action="store_true")
args = parser.parse_args(sys.argv[2:])

index_data = load_media_index()
items = sorted(index_data.get("items", []), key=lambda item: item.get("createdAt", ""), reverse=True)
now = datetime.now(timezone.utc)
session_data = load_json(get_session_file(), {"activeMediaIds": []})
active_ids = set(session_data.get("activeMediaIds", []))

def not_expired(item):
    expires_at = item.get("expiresAt")
    if not expires_at:
        return True
    return datetime.fromisoformat(expires_at.replace("Z", "+00:00")) > now

rows = []
for item in items:
    if item.get("status") != "ready" or not_expired(item) is False:
        continue
    row = {
        "media_id": item.get("id"),
        "kind": item.get("kind"),
        "createdAt": item.get("createdAt"),
        "originalFilename": item.get("originalFilename"),
        "status": item.get("status"),
        "expiresAt": item.get("expiresAt"),
        "analysisCount": len(item.get("analysisIds", [])),
        "isActive": item.get("id") in active_ids,
    }
    if args.active_only and not row["isActive"]:
        continue
    rows.append(row)

rows = rows[: max(args.limit, 1)]

if args.json:
    print(json.dumps(rows, ensure_ascii=False))
    sys.exit(0)

if not rows:
    print("No recent media available.")
    sys.exit(0)

print("=== Recent Media ===")
for idx, row in enumerate(rows, 1):
    active = "yes" if row["isActive"] else "no"
    print(
        f"{idx}. {row['media_id']} | {row['kind']} | {row['createdAt']} | {row['originalFilename']} | "
        f"status={row['status']} | expires={row['expiresAt']} | analyses={row['analysisCount']} | active={active}"
    )
PY
