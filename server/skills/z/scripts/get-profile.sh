#!/usr/bin/env bash
# get-profile.sh - Read user profile
# Usage: bash scripts/get-profile.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

python3 - "$DATA_DIR" << 'PY'
import sys, os, json

data_dir = sys.argv[1]
prof_path = os.path.join(data_dir, "profile.json")

if not os.path.exists(prof_path):
    print("Profile has not been created yet.")
    print("Set baseline metrics first, for example:")
    print('  bash scripts/set-profile.sh \'{"height_cm":175,"weight_kg":70,"age":25,"gender":"male"}\'')
    sys.exit(0)

profile = json.load(open(prof_path))

print("=== Profile ===")
print(f"Height: {profile.get('height_cm', '?')} cm")
print(f"Weight: {profile.get('weight_kg', '?')} kg")
print(f"Age: {profile.get('age', '?')}")
print(f"Gender: {profile.get('gender', '?')}")
if profile.get('body_fat_pct'):
    print(f"Body fat: {profile['body_fat_pct']}%")
if profile.get('activity_level'):
    print(f"Activity level: {profile['activity_level']}")
print()
print(f"BMR: {profile.get('bmr', '?')} kcal/day")
print(f"TDEE: {profile.get('tdee', '?')} kcal/day")
print(f"Goal: {profile.get('goal', 'not set')}")
print(f"Daily target: {profile.get('daily_target', '?')} kcal")
if profile.get('notes'):
    print(f"Notes: {profile['notes']}")
PY
