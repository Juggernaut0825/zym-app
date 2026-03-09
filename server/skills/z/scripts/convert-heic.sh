#!/usr/bin/env bash
# convert-heic.sh - Convert HEIC image to JPG
# Usage: bash scripts/convert-heic.sh <heic_path>

set -euo pipefail

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && echo "Usage: convert-heic.sh <heic_path>" && exit 1
[ ! -f "$FILE_PATH" ] && echo "ERROR: File not found: $FILE_PATH" && exit 1

EXT="${FILE_PATH##*.}"
if [[ "${EXT,,}" != "heic" ]]; then
    echo "WARNING: File extension is not .heic, attempting conversion anyway..."
fi

JPG_PATH="${FILE_PATH%.*}.jpg"

# Use sips (macOS) or ImageMagick
if command -v sips &> /dev/null; then
    sips -s format jpeg "$FILE_PATH" --out "$JPG_PATH" 2>/dev/null
elif command -v convert &> /dev/null; then
    convert "$FILE_PATH" "$JPG_PATH"
else
    echo "ERROR: sips (macOS) or ImageMagick is required to convert HEIC."
    exit 1
fi

echo "Converted: $JPG_PATH"
echo "$JPG_PATH"
