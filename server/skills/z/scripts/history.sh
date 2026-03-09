#!/usr/bin/env bash
# history.sh - View historical records
# Usage: bash scripts/history.sh [days]
# days: Number of days to review, default 7

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

DAYS="${1:-7}"

python3 - "$DATA_DIR" "$DAYS" << 'PY'
import sys, os, json
from datetime import date, timedelta

data_dir = sys.argv[1]
days = int(sys.argv[2]) if len(sys.argv) > 2 else 7

# Load daily records
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

# Load profile
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)

print(f"=== Last {days} Days ===")
print()

has_data = False
for i in range(days):
    d = (date.today() - timedelta(days=i)).isoformat()
    if d in logs:
        has_data = True
        day = logs[d]
        intake = day.get("total_intake", 0)
        burned = day.get("total_burned", 0)
        meals = len(day.get("meals", []))
        training = len(day.get("training", []))
        weight = day.get("weight_kg")

        line = f"{d}: intake {intake} kcal | burned {burned} kcal | meals {meals} | training {training}"
        if weight:
            line += f" | weight {weight}kg"
        if daily_target:
            diff = intake - burned - daily_target
            if diff > 0:
                line += f" | over by {diff}"
            else:
                line += f" | remaining {abs(diff)}"
        print(line)

if not has_data:
    print("No historical records found.")
PY
