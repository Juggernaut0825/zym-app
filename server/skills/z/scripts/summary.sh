#!/usr/bin/env bash
# summary.sh - Get today's or this week's summary
# Usage: bash scripts/summary.sh [today|week]

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

PERIOD="${1:-today}"

python3 - "$DATA_DIR" "$PERIOD" << 'PY'
import sys, os, json
from datetime import date, timedelta

data_dir = sys.argv[1]
period = sys.argv[2] if len(sys.argv) > 2 else "today"

# Load profile
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}
daily_target = profile.get("daily_target", 0)
goal = profile.get("goal", "not set")
tdee = profile.get("tdee", 0)

# Load daily records
log_path = os.path.join(data_dir, "daily.json")
logs = json.load(open(log_path)) if os.path.exists(log_path) else {}

if period == "today":
    target_date = date.today().isoformat()

    print(f"=== Summary for {target_date} ===")
    print(f"Goal: {goal} | Daily target: {daily_target} kcal | TDEE: {tdee}")
    print()

    if target_date not in logs:
        print("No records for today yet.")
        sys.exit(0)

    day = logs[target_date]
    meals = day.get("meals", [])
    training = day.get("training", [])

    intake = day.get("total_intake", 0)
    burned = day.get("total_burned", 0)
    net = intake - burned

    # Total macros
    protein = sum(m.get("protein_g", 0) for m in meals)
    carbs = sum(m.get("carbs_g", 0) for m in meals)
    fat = sum(m.get("fat_g", 0) for m in meals)

    print(f"Meals: {len(meals)} | Training: {len(training)}")
    print()
    print(f"Intake: {intake} kcal")
    print(f"Burned: {burned} kcal")
    print(f"Net: {net} kcal")

    if daily_target:
        remaining = daily_target - net
        print()
        if remaining > 0:
            print(f"Remaining: ~{remaining} kcal")
        else:
            print(f"Over target by: {abs(remaining)} kcal")

    print()
    print(f"Macros: P {protein}g | C {carbs}g | F {fat}g")

elif period == "week":
    print("=== Weekly Summary ===")
    print(f"Goal: {goal} | Daily target: {daily_target} kcal")
    print()

    total_intake = 0
    total_burned = 0
    days_with_data = 0

    for i in range(7):
        d = (date.today() - timedelta(days=i)).isoformat()
        if d in logs:
            days_with_data += 1
            day = logs[d]
            intake = day.get("total_intake", 0)
            burned = day.get("total_burned", 0)
            total_intake += intake
            total_burned += burned

            meals = len(day.get("meals", []))
            train = len(day.get("training", []))
            print(f"  {d}: intake {intake} kcal | burned {burned} kcal | meals {meals} | training {train}")

    if days_with_data == 0:
        print("No records for this week yet.")
    else:
        print()
        avg_intake = round(total_intake / days_with_data)
        avg_burned = round(total_burned / days_with_data)
        print(f"Days with records: {days_with_data}/7")
        print(f"Average intake: {avg_intake} kcal/day")
        print(f"Average burned: {avg_burned} kcal/day")
        print(f"Weekly net: {total_intake - total_burned} kcal")

else:
    print(f"Unknown period: {period}. Use today or week.")
PY
