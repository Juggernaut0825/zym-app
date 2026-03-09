#!/usr/bin/env bash
# set-goal.sh - Set fitness goal (cut/bulk/maintain)
# Usage: bash scripts/set-goal.sh <cut|bulk|maintain>

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

GOAL="${1:-}"
[ -z "$GOAL" ] && echo "Usage: set-goal.sh <cut|bulk|maintain>" && exit 1

mkdir -p "$DATA_DIR"

python3 - "$GOAL" "$DATA_DIR" << 'PY'
import sys, os, json

goal = sys.argv[1].lower()
data_dir = sys.argv[2]

if goal not in ("cut", "bulk", "maintain"):
    print("ERROR: goal must be cut, bulk, or maintain")
    sys.exit(1)

prof_path = os.path.join(data_dir, "profile.json")
if os.path.exists(prof_path):
    try:
        with open(prof_path, "r", encoding="utf-8") as handle:
            profile = json.load(handle)
    except Exception:
        profile = {}
else:
    profile = {}

tdee = profile.get("tdee")
if not tdee:
    print("ERROR: Set baseline body metrics before setting a goal.")
    print("Run: bash scripts/set-profile.sh '{\"height_cm\":...,\"weight_kg\":...,\"age\":...,\"gender\":\"male|female\"}'")
    sys.exit(1)

if goal == "cut":
    target = round(tdee - 500)
    desc = f"Cut: {target} kcal/day (TDEE - 500)"
elif goal == "bulk":
    target = round(tdee + 300)
    desc = f"Bulk: {target} kcal/day (TDEE + 300)"
else:
    target = tdee
    desc = f"Maintain: {target} kcal/day (= TDEE)"

profile["goal"] = goal
profile["daily_target"] = target

tmp_path = prof_path + ".tmp"
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(profile, f, indent=2, ensure_ascii=False)
os.replace(tmp_path, prof_path)

print("=== Goal Updated ===")
print(f"Goal type: {desc}")
print(f"TDEE: {tdee} kcal/day")
print(f"Daily calorie target: {target} kcal/day")
PY
