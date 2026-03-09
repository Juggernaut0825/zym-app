#!/usr/bin/env bash
# analyze-form.sh - Analyze workout video and evaluate form quality
# Usage: bash scripts/analyze-form.sh <video_path>
# Supports: mp4, webm, mov, avi, mkv

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
USER_ID="${ZJ_USER_ID:-local}"
DATA_DIR="${ZJ_DATA_DIR:-$PROJECT_DIR/data/$USER_ID}"

[ -f "$PROJECT_DIR/.env" ] && source "$PROJECT_DIR/.env"
[ -z "${OPENROUTER_API_KEY:-}" ] && echo "ERROR: OPENROUTER_API_KEY is missing" && exit 1

if [[ "${1:-}" == "--media-id" ]]; then
  MEDIA_ID="${2:-}"
  QUESTION=""

  if [[ "${3:-}" == "--question" ]]; then
    QUESTION="${4:-}"
  fi

  if [[ -n "$QUESTION" ]]; then
    exec bash "$SCRIPT_DIR/inspect-media.sh" --media-id "$MEDIA_ID" --domain training --question "$QUESTION"
  fi

  exec bash "$SCRIPT_DIR/inspect-media.sh" --media-id "$MEDIA_ID" --domain training
fi

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: analyze-form.sh <video_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

mkdir -p "$DATA_DIR"
echo "Analyzing workout video..."

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
    m = {"mp4":"video/mp4","webm":"video/webm","mov":"video/quicktime",
         "avi":"video/x-msvideo","mkv":"video/x-matroska"}
    return m.get(ext, "video/mp4")

def encode(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

def safe_write_json(path, payload):
    temp_path = path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    os.replace(temp_path, path)

# Check file size (Gemini has a 20MB limit for this path)
file_size = os.path.getsize(file_path)
if file_size > 20 * 1024 * 1024:
    print("WARNING: Video file is over 20MB and may fail.")
    print(f"Current size: {file_size / 1024 / 1024:.1f}MB")

mt = mime_type(file_path)
b64 = encode(file_path)

prompt = """Analyze this workout video. Identify the movement and provide a professional form assessment.

Return ONLY valid JSON (no extra text):
{
  "exercise": "identified movement name",
  "form_score": "score from 1-10",
  "issues": ["issue 1", "issue 2"],
  "coaching_cues": ["cue 1", "cue 2"],
  "injury_risk": "low|medium|high",
  "risk_reasons": ["risk reason"],
  "observations": "overall observations",
  "estimated_reps": "estimated reps or null",
  "estimated_weight_kg": "estimated weight in kg or null"
}

Focus points:
1. Identify the specific lift or movement (squat, deadlift, bench press, etc.).
2. Evaluate technique quality (spine position, knee tracking, range/depth, bar path).
3. Flag potential injury risks.
4. Provide concrete correction cues."""

content = [
    {"type":"video_url","video_url":{"url":f"data:{mt};base64,{b64}"}},
    {"type":"text","text":prompt},
]

payload = json.dumps({
    "model": MODEL,
    "messages": [{"role": "user", "content": content}],
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
result = json.loads(raw)

# Save to daily records
t = date.today().isoformat()
time_str = datetime.now().strftime("%H:%M")

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

training_entry = {
    "time": time_str,
    "type": "form_check",
    "exercise": result.get("exercise", "Unknown"),
    "form_score": result.get("form_score", 0),
    "issues": result.get("issues", []),
    "coaching_cues": result.get("coaching_cues", []),
    "video_path": file_path
}
logs[t]["training"].append(training_entry)

safe_write_json(log_path, logs)

# Output
print("\n=== Form Analysis Result ===")
print(f"Exercise: {result.get('exercise', 'Unknown')}")
print(f"Score: {result.get('form_score', '?')}/10")
print(f"Injury risk: {result.get('injury_risk', '?').upper()}")
if result.get('risk_reasons'):
    print(f"Risk reasons: {', '.join(result['risk_reasons'])}")

print(f"\nObservations: {result.get('observations', '-')}")

if result.get('issues'):
    print("\nIssues:")
    for issue in result['issues']:
        print(f"  - {issue}")

if result.get('coaching_cues'):
    print("\nCoaching cues:")
    for cue in result['coaching_cues']:
        print(f"  → {cue}")
PY
