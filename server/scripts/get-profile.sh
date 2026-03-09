#!/bin/bash
# Get user profile

USER_ID=$1
PROFILE_FILE="./data/$USER_ID/profile.json"

if [ -f "$PROFILE_FILE" ]; then
  cat "$PROFILE_FILE"
else
  echo "{}"
fi
