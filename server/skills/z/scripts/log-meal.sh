#!/usr/bin/env bash
# log-meal.sh - Log meals from text description
# Usage: bash scripts/log-meal.sh "<food description>"

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

[ -f "$PROJECT_DIR/.env" ] && source "$PROJECT_DIR/.env"
[ -z "${OPENROUTER_API_KEY:-}" ] && echo "ERROR: OPENROUTER_API_KEY is missing" && exit 1

DESC="${1:-}"
[ -z "$DESC" ] && echo "Usage: log-meal.sh \"<food description>\"" && exit 1

mkdir -p "$DATA_DIR"
echo "Estimating nutrition for: $DESC..."

python3 - "$DESC" "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json
from urllib import request, error
from datetime import datetime, timezone

desc = sys.argv[1]
data_dir = sys.argv[2]
api_key = sys.argv[3]

MODEL = os.environ.get("GAUZ_LLM_MODEL", "google/gemini-3-flash-preview")
URL = "https://openrouter.ai/api/v1/chat/completions"

prompt = f"""Estimate calories and macros for the following food description: {desc}

Return ONLY valid JSON (no extra text):
{{
  "items": [
    {{"food": "Food name", "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "portion": "estimated portion"}}
  ],
  "total": {{"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number}},
  "description": "overall description"
}}

Use realistic assumptions for portions. If the user provided a portion, prioritize it."""

payload = json.dumps({
    "model": MODEL,
    "messages": [{"role": "user", "content": prompt}],
    "max_tokens": 2048,
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
data = json.loads(raw)

def to_number(value, minimum=0, maximum=50000):
    try:
        number = float(value)
    except Exception:
        return 0
    if number < minimum:
        return minimum
    if number > maximum:
        return maximum
    return round(number, 2)

def safe_write_json(path, payload):
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)

items = data.get("items", [])
if not isinstance(items, list):
    items = []
items = items[:20]

clean_items = []
for item in items:
    if not isinstance(item, dict):
        continue
    clean_items.append({
        "food": str(item.get("food", "Unknown"))[:120],
        "calories": to_number(item.get("calories", 0), maximum=5000),
        "protein_g": to_number(item.get("protein_g", 0), maximum=500),
        "carbs_g": to_number(item.get("carbs_g", 0), maximum=1000),
        "fat_g": to_number(item.get("fat_g", 0), maximum=500),
        "portion": str(item.get("portion", ""))[:120],
    })

total = data.get("total", {})
if not isinstance(total, dict):
    total = {}

description = str(data.get("description", desc))[:500]

# Save to daily records
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

meal_entry = {
    "time": time_str,
    "calories": to_number(total.get("calories", 0), maximum=10000),
    "protein_g": to_number(total.get("protein_g", 0), maximum=500),
    "carbs_g": to_number(total.get("carbs_g", 0), maximum=1000),
    "fat_g": to_number(total.get("fat_g", 0), maximum=500),
    "description": description,
    "items": clean_items
}
logs[t]["meals"].append(meal_entry)
logs[t]["total_intake"] = sum(m.get("calories",0) for m in logs[t]["meals"])

safe_write_json(log_path, logs)

# Output
print(f"\n=== Meal Logged ===")
print(f"Time: {time_str}")
print(f"Description: {description}")
print(f"\nTotal calories: {total.get('calories', 0)} kcal")
print(f"Protein: {total.get('protein_g', 0)}g | Carbs: {total.get('carbs_g', 0)}g | Fat: {total.get('fat_g', 0)}g")
print(f"\nToday's total intake: {logs[t]['total_intake']} kcal")
PY
