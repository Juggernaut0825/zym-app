#!/bin/bash
# Log workout to user's training history

USER_ID=$1
WORKOUT_DATA=$2

DATA_DIR="./data/$USER_ID"
mkdir -p "$DATA_DIR"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%s)

echo "$WORKOUT_DATA" | jq -c ". + {date: \"$DATE\", timestamp: $TIMESTAMP}" >> "$DATA_DIR/workouts.jsonl"

echo "Workout logged successfully"
