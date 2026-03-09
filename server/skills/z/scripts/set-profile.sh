#!/usr/bin/env bash
# set-profile.sh - Set or update user profile
# Usage:
#   bash scripts/set-profile.sh '<json>'
#   bash scripts/set-profile.sh --height 175 --weight 70 --age 25 --gender male
# Examples:
#   bash scripts/set-profile.sh '{"height_cm":175,"weight_kg":70,"age":25,"gender":"male"}'
#   bash scripts/set-profile.sh --height 175 --weight 70 --age 25 --gender male --goal cut

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

if [ "$#" -eq 0 ]; then
  echo "Usage:"
  echo "  bash scripts/set-profile.sh '<json>'"
  echo "  bash scripts/set-profile.sh --height 175 --weight 70 --age 25 --gender male [--goal cut]"
  exit 1
fi

mkdir -p "$DATA_DIR"

python3 - "$DATA_DIR" "$@" << 'PY'
import sys, os, json

data_dir = sys.argv[1]
raw_args = sys.argv[2:]

def parse_updates(args):
    if len(args) == 1:
        token = str(args[0]).strip()
        if token.startswith("{") and token.endswith("}"):
            try:
                parsed = json.loads(token)
            except json.JSONDecodeError as e:
                print(f"ERROR: Invalid JSON: {e}")
                sys.exit(1)
            if not isinstance(parsed, dict):
                print("ERROR: profile update must be a JSON object")
                sys.exit(1)
            return parsed

    aliases = {
        "--height": "height_cm",
        "--height-cm": "height_cm",
        "--height_cm": "height_cm",
        "--weight": "weight_kg",
        "--weight-kg": "weight_kg",
        "--weight_kg": "weight_kg",
        "--age": "age",
        "--gender": "gender",
        "--body-fat": "body_fat_pct",
        "--body-fat-pct": "body_fat_pct",
        "--body_fat_pct": "body_fat_pct",
        "--activity": "activity_level",
        "--activity-level": "activity_level",
        "--activity_level": "activity_level",
        "--goal": "goal",
        "--experience": "experience_level",
        "--experience-level": "experience_level",
        "--experience_level": "experience_level",
        "--training-days": "training_days",
        "--training_days": "training_days",
        "--notes": "notes",
        "--preferences": "preferences",
    }

    parsed = {}
    idx = 0
    while idx < len(args):
        key = str(args[idx]).strip()
        if key in ("-h", "--help"):
            print("Usage: set-profile.sh '<json>' OR --height <cm> --weight <kg> --age <n> --gender <male|female>")
            sys.exit(0)
        field = aliases.get(key)
        if not field:
            print(f"ERROR: Unsupported argument: {key}")
            sys.exit(1)
        if idx + 1 >= len(args):
            print(f"ERROR: Missing value for argument: {key}")
            sys.exit(1)
        value = args[idx + 1]
        if field == "preferences":
            values = [part.strip() for part in str(value).split(",") if part.strip()]
            parsed.setdefault("preferences", [])
            parsed["preferences"].extend(values)
        else:
            parsed[field] = value
        idx += 2

    return parsed

updates = parse_updates(raw_args)

if not isinstance(updates, dict):
    print("ERROR: profile update must be a JSON object")
    sys.exit(1)

def to_number(value, minimum=None, maximum=None, as_int=False):
    try:
        number = float(value)
    except Exception:
        return None
    if minimum is not None and number < minimum:
        return None
    if maximum is not None and number > maximum:
        return None
    return int(number) if as_int else round(number, 2)

def sanitize_profile_updates(raw):
    cleaned = {}
    allowed_gender = {"male", "female"}
    allowed_activity = {"sedentary", "light", "moderate", "active", "very_active"}
    allowed_goal = {"cut", "bulk", "maintain"}
    allowed_experience = {"beginner", "intermediate", "advanced"}

    if "height_cm" in raw:
        value = to_number(raw.get("height_cm"), minimum=80, maximum=260)
        if value is not None:
            cleaned["height_cm"] = value
    if "weight_kg" in raw:
        value = to_number(raw.get("weight_kg"), minimum=20, maximum=350)
        if value is not None:
            cleaned["weight_kg"] = value
    if "age" in raw:
        value = to_number(raw.get("age"), minimum=10, maximum=100, as_int=True)
        if value is not None:
            cleaned["age"] = value
    if "body_fat_pct" in raw:
        value = to_number(raw.get("body_fat_pct"), minimum=2, maximum=70)
        if value is not None:
            cleaned["body_fat_pct"] = value

    if "gender" in raw:
        gender = str(raw.get("gender", "")).lower().strip()
        if gender in allowed_gender:
            cleaned["gender"] = gender
    if "activity_level" in raw:
        level = str(raw.get("activity_level", "")).lower().strip()
        if level in allowed_activity:
            cleaned["activity_level"] = level
    if "goal" in raw:
        goal = str(raw.get("goal", "")).lower().strip()
        if goal in allowed_goal:
            cleaned["goal"] = goal
    if "experience_level" in raw:
        level = str(raw.get("experience_level", "")).lower().strip()
        if level in allowed_experience:
            cleaned["experience_level"] = level
    if "training_days" in raw:
        value = to_number(raw.get("training_days"), minimum=1, maximum=7, as_int=True)
        if value is not None:
            cleaned["training_days"] = value
    if "notes" in raw:
        cleaned["notes"] = str(raw.get("notes", "")).strip()[:2000]
    if "preferences" in raw and isinstance(raw.get("preferences"), list):
        prefs = [str(item).strip()[:100] for item in raw.get("preferences", []) if str(item).strip()]
        cleaned["preferences"] = prefs[:20]

    return cleaned

updates = sanitize_profile_updates(updates)
if not updates:
    print("ERROR: no valid profile fields found in input")
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

# Update fields
profile.update(updates)

# Recalculate BMR/TDEE when body metrics are available
h = profile.get("height_cm")
w = profile.get("weight_kg")
a = profile.get("age")
g = profile.get("gender", "male").lower()
bf = profile.get("body_fat_pct")
activity = profile.get("activity_level", "moderate")

if h and w and a:
    # BMR calculation
    if bf:
        lbm = w * (1 - bf / 100)
        bmr = round(370 + 21.6 * lbm)  # Katch-McArdle
    elif g == "male":
        bmr = round(10 * w + 6.25 * h - 5 * a + 5)  # Mifflin-St Jeor
    else:
        bmr = round(10 * w + 6.25 * h - 5 * a - 161)

    # TDEE activity multipliers
    activity_multipliers = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    tdee = round(bmr * activity_multipliers.get(activity, 1.55))

    profile["bmr"] = bmr
    profile["tdee"] = tdee

    # Update daily target if goal exists
    goal = profile.get("goal", "maintain")
    if goal == "cut":
        profile["daily_target"] = round(tdee - 500)
    elif goal == "bulk":
        profile["daily_target"] = round(tdee + 300)
    else:
        profile["daily_target"] = tdee

tmp_path = prof_path + ".tmp"
with open(tmp_path, "w", encoding="utf-8") as f:
    json.dump(profile, f, indent=2, ensure_ascii=False)
os.replace(tmp_path, prof_path)

print("=== Profile Updated ===")
for key, value in profile.items():
    if value is not None:
        print(f"  {key}: {value}")
PY
