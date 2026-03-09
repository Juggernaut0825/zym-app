#!/usr/bin/env bash
# get-plan.sh - Read current training plan
# Usage: bash scripts/get-plan.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

python3 - "$DATA_DIR" << 'PY'
import sys, os, json

data_dir = sys.argv[1]
plan_path = os.path.join(data_dir, "training_plan.json")

if not os.path.exists(plan_path):
    print("No training plan found.")
    print("Use generate-plan.sh to create one.")
    sys.exit(0)

plan = json.load(open(plan_path))

print("=== Training Plan ===")
print(f"Plan name: {plan.get('name', 'Custom Plan')}")
print(f"Created at: {plan.get('created_at', '?')}")
print()

for day in plan.get("days", []):
    day_name = day.get("day", "?")
    exercises = day.get("exercises", [])
    notes = day.get("notes", "")

    print(f"[{day_name}]")
    for ex in exercises:
        name = ex.get("name", "?")
        sets = ex.get("sets", "?")
        reps = ex.get("reps", "?")
        rest = ex.get("rest", "")
        ex_notes = ex.get("notes", "")

        line = f"  - {name}: {sets}x{reps}"
        if rest:
            line += f" (rest {rest})"
        print(line)
        if ex_notes:
            print(f"    Notes: {ex_notes}")
    if notes:
        print(f"  > {notes}")
    print()
PY
