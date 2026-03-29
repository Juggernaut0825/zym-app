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

aws s3 cp "$SOURCE_DIR/admin.html" "s3://${BUCKET_NAME}/admin.html" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate"

aws s3 cp "$SOURCE_DIR/admin.css" "s3://${BUCKET_NAME}/admin.css" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate"

aws s3 cp "$SOURCE_DIR/admin.js" "s3://${BUCKET_NAME}/admin.js" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate"

aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/admin.html" "/admin.css" "/admin.js" \
  --region "$AWS_REGION" >/dev/null

echo "Admin site deployed to https://zym8.com/admin.html"
