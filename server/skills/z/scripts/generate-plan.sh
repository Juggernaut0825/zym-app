#!/usr/bin/env bash
# generate-plan.sh - Generate a personalized training plan
# Usage: bash scripts/generate-plan.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

[ -f "$PROJECT_DIR/.env" ] && source "$PROJECT_DIR/.env"
[ -z "${OPENROUTER_API_KEY:-}" ] && echo "ERROR: OPENROUTER_API_KEY is missing" && exit 1

mkdir -p "$DATA_DIR"
echo "Generating training plan..."

python3 - "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json
from urllib import request, error
from datetime import date

data_dir = sys.argv[1]
api_key = sys.argv[2]

MODEL = os.environ.get("GAUZ_LLM_MODEL", "google/gemini-3-flash-preview")
URL = "https://openrouter.ai/api/v1/chat/completions"

# Load profile
prof_path = os.path.join(data_dir, "profile.json")
profile = json.load(open(prof_path)) if os.path.exists(prof_path) else {}

goal = profile.get("goal", "maintain")
experience = profile.get("experience_level", "intermediate")
days_per_week = profile.get("training_days", 4)
preferences = profile.get("preferences", [])

prompt = f"""Generate a personalized training plan for this user.

User info:
- Goal: {goal} (cut, bulk, maintain)
- Experience level: {experience}
- Training days per week: {days_per_week}
- Preferences: {', '.join(preferences) if preferences else 'no specific preferences'}

Return ONLY valid JSON:
{{
  "name": "plan name",
  "created_at": "{date.today().isoformat()}",
  "goal": "{goal}",
  "days_per_week": {days_per_week},
  "days": [
    {{
      "day": "Day 1",
      "exercises": [
        {{"name": "Bench Press", "sets": 4, "reps": "8-10", "rest": "90s", "notes": "execution note"}},
        ...
      ],
      "notes": "day notes"
    }},
    ...
  ],
  "general_notes": "overall guidance"
}}

Adjust by goal:
- cut: higher rep ranges (12-15), shorter rest (~60s), include more cardio
- bulk: lower rep ranges (6-8), longer rest (2-3min), focus on compound lifts
- maintain: moderate rep ranges (8-12), balanced programming"""

payload = json.dumps({
    "model": MODEL,
    "messages": [{"role": "user", "content": prompt}],
    "max_tokens": 4096,
}).encode("utf-8")
req = request.Request(URL, data=payload, headers={
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}, method="POST")

try:
    with request.urlopen(req, timeout=120) as resp:
        response_data = json.loads(resp.read().decode("utf-8"))
except error.HTTPError as exc:
    detail = exc.read().decode("utf-8", errors="replace")
    print(f"ERROR: OpenRouter HTTP {exc.code}: {detail}")
    sys.exit(1)
except error.URLError as exc:
    print(f"ERROR: OpenRouter network error: {exc}")
    sys.exit(1)

raw = response_data["choices"][0]["message"]["content"]
raw = raw.strip().strip("`").removeprefix("json").strip()
plan = json.loads(raw)

# Save plan
plan_path = os.path.join(data_dir, "training_plan.json")
temp_path = plan_path + ".tmp"
with open(temp_path, "w", encoding="utf-8") as f:
    json.dump(plan, f, indent=2, ensure_ascii=False)
os.replace(temp_path, plan_path)

print("\n=== Training Plan Generated ===")
print(f"Plan name: {plan.get('name', 'Custom')}")
print(f"Goal: {plan.get('goal', '?')}")
print(f"Days per week: {plan.get('days_per_week', '?')}")
print()

for day in plan.get("days", []):
    print(f"[{day.get('day', '?')}]")
    for ex in day.get("exercises", []):
        name = ex.get("name", "?")
        sets = ex.get("sets", "?")
        reps = ex.get("reps", "?")
        print(f"  - {name}: {sets}x{reps}")
    print()

if plan.get("general_notes"):
    print(f"General notes: {plan['general_notes']}")
PY
