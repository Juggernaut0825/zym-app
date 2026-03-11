#!/usr/bin/env bash
# log-training.sh - Log training data
# Usage: bash scripts/log-training.sh '<json_array>'
# Example: bash scripts/log-training.sh '[{"name":"Back Squat","sets":4,"reps":"4","weight_kg":112.5}]'

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

JSON_INPUT="${1:-}"
[ -z "$JSON_INPUT" ] && echo "Usage: log-training.sh '<json_array>'" && exit 1

mkdir -p "$DATA_DIR"

python3 - "$JSON_INPUT" "$DATA_DIR" << 'PY'
import sys, os, json
from datetime import datetime, timezone

json_input = sys.argv[1]
data_dir = sys.argv[2]

try:
    exercises = json.loads(json_input)
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON: {e}")
    sys.exit(1)

if not isinstance(exercises, list):
    exercises = [exercises]
exercises = exercises[:20]

def to_number(value, minimum=0, maximum=100000, as_int=False):
    try:
        number = float(value)
    except Exception:
        return minimum
    if number < minimum:
        number = minimum
    if number > maximum:
        number = maximum
    return int(number) if as_int else round(number, 2)

def safe_write_json(path, payload):
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)

# Save into daily records
now_utc = datetime.now(timezone.utc)
t = now_utc.date().isoformat()
time_str = now_utc.strftime("%H:%M")

log_path = os.path.join(data_dir, "daily.json")
if os.path.exists(log_path):
    try:
        with open(log_path, "r", encoding="utf-8") as handle:
            logs = json.load(handle)
    except Exception:
        logs = {}
else:
    logs = {}
if not isinstance(logs, dict):
    logs = {}
if t not in logs:
    logs[t] = {"meals":[],"training":[],"total_intake":0,"total_burned":0}

# Calculate total volume and estimated burn
total_volume = 0
for ex in exercises:
    if not isinstance(ex, dict):
        continue
    sets = to_number(ex.get("sets", 0), minimum=0, maximum=50, as_int=True)
    reps = str(ex.get("reps", "0"))[:20]
    weight = to_number(ex.get("weight_kg", 0), minimum=0, maximum=500)

    # Reps can arrive as string values
    try:
        reps_num = int(float(reps)) if isinstance(reps, str) else int(reps)
    except:
        reps_num = 1
    reps_num = max(1, min(reps_num, 200))

    volume = sets * reps_num * weight
    total_volume += volume

    entry = {
        "time": time_str,
        "name": str(ex.get("name", "Unknown"))[:120],
        "sets": sets,
        "reps": str(reps),
        "weight_kg": weight,
        "volume_kg": volume,
        "notes": str(ex.get("notes", ""))[:500]
    }
    logs[t]["training"].append(entry)

# Estimate burn (simple formula: ~100 kcal per 1000kg volume)
estimated_burn = round(total_volume / 10)
logs[t]["total_burned"] = logs[t].get("total_burned", 0) + estimated_burn

safe_write_json(log_path, logs)

# Output
print(f"\n=== Training Logged ===")
print(f"Time: {time_str}")
print(f"Exercises: {len(exercises)}")
print(f"Total volume: {total_volume:.1f} kg")
print(f"Estimated burn: {estimated_burn} kcal")
print()

for ex in exercises:
    name = ex.get("name", "Unknown")
    sets = ex.get("sets", "?")
    reps = ex.get("reps", "?")
    weight = ex.get("weight_kg", "?")
    print(f"  - {name}: {sets}x{reps} @ {weight}kg")
PY
