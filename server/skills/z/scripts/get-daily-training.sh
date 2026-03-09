#!/usr/bin/env bash
# get-daily-training.sh - Get daily training records
# Usage: bash scripts/get-daily-training.sh [date]
# Date format: YYYY-MM-DD (defaults to today)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

DATE="${1:-}"

python3 - "$DATA_DIR" "$DATE" << 'PY'
import sys, os, json
from datetime import date

data_dir = sys.argv[1]
date_arg = sys.argv[2] if len(sys.argv) > 2 else None

target_date = date_arg if date_arg else date.today().isoformat()

# Load daily records
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

if target_date not in logs:
    print(f"No training records found for {target_date}.")
    sys.exit(0)

day = logs[target_date]
training = day.get("training", [])

print(f"=== Training for {target_date} ===")
print(f"Sessions logged: {len(training)}")
print()

for i, session in enumerate(training, 1):
    sess_type = session.get("type", "exercise")
    time = session.get("time", "?")

    if sess_type == "form_check":
        # Video form-analysis entry
        exercise = session.get("exercise", "?")
        score = session.get("form_score", "?")
        issues = session.get("issues", [])
        print(f"{i}. [{time}] Form analysis: {exercise}")
        print(f"   Score: {score}/10")
        if issues:
            print(f"   Issues: {', '.join(issues[:2])}")
    else:
        # Regular training entry
        name = session.get("name", "?")
        sets = session.get("sets", "?")
        reps = session.get("reps", "?")
        weight = session.get("weight_kg", "?")
        volume = session.get("volume_kg", 0)
        notes = session.get("notes", "")

        print(f"{i}. [{time}] {name}")
        print(f"   {sets}x{reps} @ {weight}kg (volume: {volume:.1f}kg)")
        if notes:
            print(f"   Notes: {notes}")

print()
print("=== Summary ===")
print(f"Total burned: {day.get('total_burned', 0)} kcal")
PY
