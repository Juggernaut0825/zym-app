#!/bin/bash
# Log meal to user's nutrition history

USER_ID=$1
MEAL_DATA=$2

DATA_DIR="./data/$USER_ID"
mkdir -p "$DATA_DIR"

DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date +%s)

echo "$MEAL_DATA" | jq -c ". + {date: \"$DATE\", timestamp: $TIMESTAMP}" >> "$DATA_DIR/meals.jsonl"

echo "Meal logged successfully"
