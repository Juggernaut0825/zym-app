#!/usr/bin/env bash
# cleanup-media.sh - Clean up expired media and analysis artifacts
# Usage: bash scripts/cleanup-media.sh [--days 7] [--dry-run]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

python3 - "$SCRIPT_DIR" "$@" << 'PY'
import argparse
import json
import shutil
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

script_dir = Path(sys.argv[1])
sys.path.insert(0, str(script_dir))

from media_common import load_json, save_json, resolve_stored_path  # noqa: E402


def parse_iso(value: str):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def cleanup_transcript(path: Path, cutoff: datetime, dry_run: bool) -> int:
    if not path.exists():
        return 0

    kept = []
    removed = 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        created_at = parse_iso(payload.get("createdAt"))
        if created_at and created_at >= cutoff:
            kept.append(json.dumps(payload, ensure_ascii=False))
        else:
            removed += 1

    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")

    return removed


parser = argparse.ArgumentParser()
parser.add_argument("--days", type=int, default=7)
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args(sys.argv[2:])

project_dir = script_dir.parent
data_root = project_dir / "data"
now = datetime.now(timezone.utc)
transcript_cutoff = now - timedelta(days=30)

removed_media = 0
removed_analyses = 0
removed_transcript_lines = 0

for user_dir in data_root.iterdir() if data_root.exists() else []:
    if not user_dir.is_dir():
        continue

    media_index_path = user_dir / "media" / "index.json"
    media_index = load_json(media_index_path, {"schemaVersion": 1, "items": []})
    keep_items = []
    removed_ids = set()

    for item in media_index.get("items", []):
        expires_at = parse_iso(item.get("expiresAt"))
        created_at = parse_iso(item.get("createdAt"))
        if not expires_at and created_at:
            expires_at = created_at + timedelta(days=args.days)
        is_expired = item.get("status") != "ready" or (expires_at and expires_at <= now)

        if is_expired:
            removed_ids.add(item.get("id"))
            stored_path = item.get("storedPath")
            resolved = resolve_stored_path(stored_path) if stored_path else None
            if resolved and resolved.exists() and not args.dry_run:
                resolved.unlink(missing_ok=True)
            if resolved and resolved.exists():
                pass
            analysis_dir = user_dir / "analyses" / str(item.get("id"))
            if analysis_dir.exists():
                if not args.dry_run:
                    removed_analyses += len(list(analysis_dir.glob("*.json")))
                    shutil.rmtree(analysis_dir, ignore_errors=True)
                else:
                    removed_analyses += len(list(analysis_dir.glob("*.json")))
            removed_media += 1
        else:
            keep_items.append(item)

    if not args.dry_run:
        media_index["items"] = keep_items
        save_json(media_index_path, media_index)

    session_path = user_dir / "context" / "session.json"
    session_data = load_json(session_path, None)
    if session_data:
        session_data["activeMediaIds"] = [media_id for media_id in session_data.get("activeMediaIds", []) if media_id not in removed_ids]
        if not args.dry_run:
            save_json(session_path, session_data)

    transcript_path = user_dir / "context" / "transcript.ndjson"
    removed_transcript_lines += cleanup_transcript(transcript_path, transcript_cutoff, args.dry_run)

print(
    json.dumps(
        {
            "removedMedia": removed_media,
            "removedAnalysisFiles": removed_analyses,
            "removedTranscriptLines": removed_transcript_lines,
            "dryRun": args.dry_run,
        },
        ensure_ascii=False,
    )
)
PY
