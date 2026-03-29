#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
BUCKET_NAME="${BUCKET_NAME:-zym-web-site}"
CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-E37ZASBAK6IVIE}"
SOURCE_DIR="${1:-admin-site}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source directory '$SOURCE_DIR' does not exist." >&2
  exit 1
fi

declare -a invalidation_paths=()

upload_file() {
  local filename="$1"
  local cache_control="$2"
  local source_path="${SOURCE_DIR}/${filename}"

  if [[ ! -f "$source_path" ]]; then
    return
  fi

  aws s3 cp "$source_path" "s3://${BUCKET_NAME}/${filename}" \
    --region "$AWS_REGION" \
    --cache-control "$cache_control"

  invalidation_paths+=("/${filename}")
}

upload_file "admin.html" "no-cache, no-store, must-revalidate"
upload_file "admin.css" "no-cache, no-store, must-revalidate"
upload_file "admin.js" "no-cache, no-store, must-revalidate"
upload_file "privacy.html" "no-cache, no-store, must-revalidate"
upload_file "terms.html" "no-cache, no-store, must-revalidate"
upload_file "legal.css" "no-cache, no-store, must-revalidate"
upload_file "logo.svg" "public, max-age=31536000, immutable"
upload_file "logo-120.png" "public, max-age=31536000, immutable"

if [[ ${#invalidation_paths[@]} -gt 0 ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "${invalidation_paths[@]}" \
    --region "$AWS_REGION" >/dev/null
fi

echo "Static site deployed:"
for path in "${invalidation_paths[@]}"; do
  echo "  https://zym8.com${path}"
done
