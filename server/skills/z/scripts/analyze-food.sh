#!/usr/bin/env bash
# analyze-food.sh - Analyze food image and estimate calories/macros
# Usage: bash scripts/analyze-food.sh <image_path>
# Supports: jpg, jpeg, png, gif, webp, heic

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

[ -f "$PROJECT_DIR/.env" ] && source "$PROJECT_DIR/.env"
[ -z "${OPENROUTER_API_KEY:-}" ] && echo "ERROR: OPENROUTER_API_KEY is missing" && exit 1

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: analyze-food.sh <image_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

# Handle HEIC input
EXT="${FILE_PATH##*.}"
if [[ "${EXT,,}" == "heic" ]]; then
    echo "HEIC detected, converting..."
    JPG_PATH="${FILE_PATH%.*}.jpg"
    sips -s format jpeg "$FILE_PATH" --out "$JPG_PATH" 2>/dev/null || {
        echo "ERROR: HEIC conversion failed. Install sips or convert manually."
        exit 1
    }
    FILE_PATH="$JPG_PATH"
    echo "Converted to: $FILE_PATH"
fi

mkdir -p "$DATA_DIR"
echo "Analyzing food image..."

python3 - "$FILE_PATH" "$DATA_DIR" "$OPENROUTER_API_KEY" << 'PY'
import sys, os, json, base64
from urllib import request, error
from datetime import date, datetime

file_path = sys.argv[1]
data_dir = sys.argv[2]
api_key = sys.argv[3]

MODEL = os.environ.get("GAUZ_LLM_MODEL", "google/gemini-3-flash-preview")
URL = "https://openrouter.ai/api/v1/chat/completions"

def mime_type(p):
    ext = os.path.splitext(p)[1].lower().strip(".")
    m = {"jpg":"image/jpeg","jpeg":"image/jpeg","png":"image/png",
         "gif":"image/gif","webp":"image/webp"}
    return m.get(ext, "image/jpeg")

def encode(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

def call_llm(prompt, img_path, max_tokens=2048):
    b64 = encode(img_path)
    mt = mime_type(img_path)
    content = [
        {"type":"image_url","image_url":{"url":f"data:{mt};base64,{b64}"}},
        {"type":"text","text":prompt},
    ]
    msgs = [{"role":"user","content":content}]
    payload = json.dumps({
        "model": MODEL,
        "messages": msgs,
        "max_tokens": max_tokens,
    }).encode("utf-8")
    req = request.Request(URL, data=payload, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"OpenRouter network error: {exc}") from exc
    return data["choices"][0]["message"]["content"]

def parse(raw):
    return json.loads(raw.strip().strip("`").removeprefix("json").strip())

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

def load_json(name, default=None):
    p = os.path.join(data_dir, name)
    if os.path.exists(p):
        with open(p) as f: return json.load(f)
    return default if default is not None else {}

def save_json(name, data):
    os.makedirs(data_dir, exist_ok=True)
    file_path = os.path.join(data_dir, name)
    temp_path = file_path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(temp_path, file_path)

# Analyze food
prompt = """Analyze this food image and estimate calories/macros.

Return ONLY valid JSON (no extra text):
{
  "items": [
    {"food": "Food name", "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "portion": "estimated portion"}
  ],
  "total": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number},
  "description": "overall description",
  "confidence": 0.0-1.0
}

If multiple foods appear, list each one with a reasonable portion estimate."""

raw = call_llm(prompt, file_path)
data = parse(raw)

items = data.get("items", [])
if not isinstance(items, list):
    items = []
items = items[:20]

total = data.get("total", {})
if not isinstance(total, dict):
    total = {}
total = {
    "calories": to_number(total.get("calories", 0), maximum=10000),
    "protein_g": to_number(total.get("protein_g", 0), maximum=500),
    "carbs_g": to_number(total.get("carbs_g", 0), maximum=1000),
    "fat_g": to_number(total.get("fat_g", 0), maximum=500),
}

description = str(data.get("description", "Food"))[:500]

# Save to daily records
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

logs = load_json("daily.json", {})
if not isinstance(logs, dict):
    logs = {}
if t not in logs:
    logs[t] = {"meals":[],"training":[],"total_intake":0,"total_burned":0}

meal_entry = {
    "time": time_str,
    "calories": total.get("calories", 0),
    "protein_g": total.get("protein_g", 0),
    "carbs_g": total.get("carbs_g", 0),
    "fat_g": total.get("fat_g", 0),
    "description": description,
    "items": items
}
logs[t]["meals"].append(meal_entry)
logs[t]["total_intake"] = sum(m.get("calories",0) for m in logs[t]["meals"])

save_json("daily.json", logs)

# Output
print(f"\n=== Food Analysis Result ===")
print(f"Time: {time_str}")
print(f"Description: {description}")
print(f"\nTotal calories: {total.get('calories', 0)} kcal")
print(f"Protein: {total.get('protein_g', 0)}g | Carbs: {total.get('carbs_g', 0)}g | Fat: {total.get('fat_g', 0)}g")
print("\nLine items:")
for item in items:
    print(f"  - {item.get('food', '?')}: {item.get('calories', 0)} kcal ({item.get('portion', '?')})")

print(f"\nToday's total intake: {logs[t]['total_intake']} kcal")
PY
