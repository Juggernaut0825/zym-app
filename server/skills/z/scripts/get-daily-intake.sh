#!/usr/bin/env bash
# get-daily-intake.sh - Get daily nutrition intake
# Usage: bash scripts/get-daily-intake.sh [date]
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
    print(f"No meal records found for {target_date}.")
    sys.exit(0)

day = logs[target_date]
meals = day.get("meals", [])

print(f"=== Intake for {target_date} ===")
print(f"Meals logged: {len(meals)}")
print()

total_cal = 0
total_protein = 0
total_carbs = 0
total_fat = 0

for i, meal in enumerate(meals, 1):
    cal = meal.get("calories", 0)
    p = meal.get("protein_g", 0)
    c = meal.get("carbs_g", 0)
    f = meal.get("fat_g", 0)
    desc = meal.get("description", "?")
    time = meal.get("time", "?")

    print(f"{i}. [{time}] {desc}")
    print(f"   {cal} kcal | P:{p}g C:{c}g F:{f}g")

    total_cal += cal
    total_protein += p
    total_carbs += c
    total_fat += f

# Load profile targets
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)

print()
print("=== Summary ===")
print(f"Total intake: {total_cal} kcal")
print(f"Protein: {total_protein}g | Carbs: {total_carbs}g | Fat: {total_fat}g")

if daily_target:
    remaining = daily_target - total_cal
    print(f"Daily target: {daily_target} kcal")
    if remaining > 0:
        print(f"Remaining: {remaining} kcal")
    else:
        print(f"Over target by: {abs(remaining)} kcal")
PY
