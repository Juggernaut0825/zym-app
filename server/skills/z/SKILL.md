---
name: z
description: >
  Skill-based fitness and lifestyle assistant. Use bash to call scripts in
  scripts/ for context lookup, profile lookup, food logging, training logging,
  media inspection, plans, and summaries. Use when the user asks about training,
  nutrition, progress, or attached images/videos/screenshots.
---

# Z

This skill is a script protocol, not a free-form shell environment.

## Agent Operating Rules

1. You have exactly one tool: `bash`.
2. Only call commands in this form: `bash scripts/<script>.sh [args...]`.
3. Do not directly run `cat`, `find`, `ls`, `jq`, `python -c`, or browse user folders.
4. Do not assume Node already loaded profile, history, or media for you. If you need context, call a script.
5. Treat `text + media` in the same user turn as one unit: the text is the question, the media is the evidence.
6. If the user says things like "this one / this image / this video / in the picture" and the target is ambiguous, first read context and list recent media.
7. For weights, colors, labels, reps, movement names, or screenshot values, never guess from memory. Use `inspect-media.sh`.
8. Never write media-inferred training data to logs until the user confirms.

## User Isolation

Every script call is scoped to the current user via environment variables injected by Node:

- `ZJ_USER_ID`
- `ZJ_DATA_DIR`
- `ZJ_CONTEXT_DIR`
- `ZJ_SESSION_FILE`
- `ZJ_MEDIA_INDEX_FILE`
- `ZJ_ACTIVE_MEDIA_IDS`

Always rely on scripts to read those paths. Do not try to reach outside the current user’s directory.

## Data Layout

The current user’s files live under `data/<userId>/`:

- `profile.json`: persistent profile and goals
- `daily.json`: daily meals, training, totals
- `context/session.json`: rolling summary, pinned facts, recent compact messages, active media
- `context/transcript.ndjson`: append-only transcript
- `media/index.json`: saved media manifest
- `media/YYYY-MM-DD/...`: downloaded images/videos
- `analyses/<media_id>/*.json`: structured media analyses

## Primary Scripts

### Context and History

- `bash scripts/get-context.sh [--scope summary|recent|full] [--limit N] [--json]`
  Use when the current turn depends on earlier conversation, unresolved references, or active media.
- `bash scripts/summary.sh [today|week]`
  Use for progress summaries.
- `bash scripts/history.sh [days]`
  Use for recent logs and trend lookups.

### Profile and Goals

- `bash scripts/get-profile.sh`
  Use before personalized training/nutrition advice if profile matters.
- `bash scripts/set-profile.sh '<json>'`
  Use when the user explicitly provides or updates profile data.
- `bash scripts/set-goal.sh <cut|bulk|maintain>`
  Use when the user explicitly changes goal.
- `bash scripts/get-plan.sh`
- `bash scripts/generate-plan.sh`

### Meals and Intake

- `bash scripts/log-meal.sh "<description>"`
- `bash scripts/analyze-food.sh <image_path>`
- `bash scripts/get-daily-intake.sh [date]`

### Training

- `bash scripts/log-training.sh '<json_or_json_array>'`
- `bash scripts/get-daily-training.sh [date]`
- `bash scripts/analyze-form.sh <video_path>`
- `bash scripts/analyze-form.sh --media-id <media_id> [--question "..."]`

### Media

- `bash scripts/list-recent-media.sh [--limit N] [--active-only] [--json]`
  Use to see what media is available and which items are active in the current session.
- `bash scripts/inspect-media.sh --media-id <media_id> --question "..." --domain training|food|chart|generic`
  Use for any question that depends on image/video/screenshot content.

## Required Script Sequences

### 1. Context-dependent follow-up

Use when the user says something like "where were we", "continue", "what about this", or refers to an earlier turn.

1. `bash scripts/get-context.sh --scope recent`
2. If media is involved, `bash scripts/list-recent-media.sh --active-only`
3. Then answer or inspect media

### 2. User sends photo/video and asks "check this"

1. Read the user text in the same turn
2. `bash scripts/list-recent-media.sh --active-only`
3. `bash scripts/inspect-media.sh --media-id ... --question "<original request>" --domain ...`
4. Answer from the script result

### 3. Later follow-up like "how much weight is this / can you see it"

1. `bash scripts/get-context.sh --scope recent`
2. `bash scripts/list-recent-media.sh --active-only`
3. Pick the correct `media_id`
4. `bash scripts/inspect-media.sh --media-id ... --question "<original request>" --domain training`
5. If low confidence or multiple scenarios exist, say so explicitly

### 4. Personalized training or nutrition advice

1. `bash scripts/get-profile.sh`
2. If recent context matters, `bash scripts/get-context.sh --scope summary`
3. Then answer

### 5. Logging training

If the data comes from explicit user text, you may log directly.

1. If needed, clarify the exact exercise / sets / reps / weight
2. `bash scripts/log-training.sh '<json>'`

If the data comes from media inference:

1. `bash scripts/inspect-media.sh ...`
2. Ask the user to confirm the inferred numbers
3. Only after confirmation call `bash scripts/log-training.sh '<json>'`

### 6. Progress / recap questions

1. `bash scripts/summary.sh`
2. If the user asks for a window or trend, `bash scripts/history.sh 7` or another day count

## Media Rules

When using `inspect-media.sh`:

- Use `training` for lifts, technique, plates, reps, bar path, movement quality.
- Use `food` for meal photos.
- Use `chart` for screenshots, dashboards, labels, numeric displays.
- Use `generic` when none of the above fit.

If the script returns low confidence, ambiguities, or multiple scenarios:

- do not collapse them into one made-up fact
- report the uncertainty
- cite the visible evidence
- ask the user to confirm before logging anything

## Prohibited Behavior

Do not:

- answer media questions without `inspect-media.sh`
- infer plate color or weight from habit or expectation
- treat one candidate scenario as confirmed truth
- write media-derived values to logs before confirmation
- browse raw files instead of using scripts

## Examples

```bash
bash scripts/get-context.sh --scope recent
bash scripts/get-profile.sh
bash scripts/list-recent-media.sh --active-only
bash scripts/inspect-media.sh --media-id med_20260301_140100_a0 --question "How much weight is on this clean?" --domain training
bash scripts/log-training.sh '[{"name":"Power Clean","sets":1,"reps":"1","weight_kg":69.1}]'
```
