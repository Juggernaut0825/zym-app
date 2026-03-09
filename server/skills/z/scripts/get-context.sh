#!/usr/bin/env bash
# get-context.sh - Read the current user's conversation context
# Usage: bash scripts/get-context.sh [--scope summary|recent|full] [--limit 6] [--json]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

python3 - "$SCRIPT_DIR" "$@" << 'PY'
import argparse
import json
import sys
from pathlib import Path

script_dir = Path(sys.argv[1])
sys.path.insert(0, str(script_dir))

from media_common import get_session_file, load_json  # noqa: E402


def empty_session():
    return {
        "schemaVersion": 1,
        "userId": "",
        "rollingSummary": "",
        "pinnedFacts": [],
        "recentMessages": [],
        "activeMediaIds": [],
        "lastMessageAt": None,
    }


def role_label(role: str, tool_name):
    if role == "user":
        return "User"
    if role == "assistant":
        return "Assistant"
    if role == "tool":
        return f"Tool({tool_name})" if tool_name else "Tool"
    return role


parser = argparse.ArgumentParser()
parser.add_argument("--scope", choices=["summary", "recent", "full"], default="recent")
parser.add_argument("--limit", type=int, default=6)
parser.add_argument("--json", action="store_true")
args = parser.parse_args(sys.argv[2:])

session = load_json(get_session_file(), empty_session())
recent_messages = session.get("recentMessages", [])
limit = max(args.limit, 1)

if args.scope == "summary":
    selected_messages = []
elif args.scope == "recent":
    selected_messages = recent_messages[-limit:]
else:
    selected_messages = recent_messages

payload = {
    "rollingSummary": session.get("rollingSummary", ""),
    "pinnedFacts": session.get("pinnedFacts", []),
    "recentMessages": selected_messages,
    "activeMediaIds": session.get("activeMediaIds", []),
    "lastMessageAt": session.get("lastMessageAt"),
}

if args.json:
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)

print("=== Session Context ===")
print(f"Scope: {args.scope}")
print()
print("Summary:")
print(payload["rollingSummary"] or "(empty)")
print()
print("Pinned facts:")
if payload["pinnedFacts"]:
    for fact in payload["pinnedFacts"]:
        print(f"- {fact}")
else:
    print("(empty)")
print()
print("Recent messages:")
if payload["recentMessages"]:
    for index, message in enumerate(payload["recentMessages"], 1):
        role = role_label(message.get("role", "unknown"), message.get("toolName"))
        text = str(message.get("text", "")).replace("\n", " ").strip() or "(empty)"
        media_ids = message.get("mediaIds") or []
        media_suffix = ""
        if media_ids and "[media:" not in text:
            media_suffix = f" {' '.join(f'[media:{media_id}]' for media_id in media_ids)}"
        print(f"{index}. {role}: {text}{media_suffix}")
else:
    print("(empty)")
print()
print("Active media:")
if payload["activeMediaIds"]:
    for media_id in payload["activeMediaIds"]:
        print(f"- {media_id}")
else:
    print("(empty)")
print()
print(f"Last updated: {payload['lastMessageAt'] or '(unknown)'}")
PY
