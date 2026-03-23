#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <owner/repo> <environment-name> [reviewer-username]" >&2
  echo "Example: GITHUB_TOKEN=... $0 Juggernaut0825/zym-app production Juggernaut0825" >&2
}

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  usage
  exit 1
fi

REPOSITORY="$1"
ENVIRONMENT_NAME="$2"
REVIEWER_USERNAME="${3:-}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

if [ -z "${TOKEN}" ]; then
  echo "GITHUB_TOKEN or GH_TOKEN is required to configure GitHub environments." >&2
  exit 1
fi

API_ROOT="https://api.github.com"
COMMON_HEADERS=(
  -H "Accept: application/vnd.github+json"
  -H "Authorization: Bearer ${TOKEN}"
  -H "X-GitHub-Api-Version: 2022-11-28"
)

REVIEWERS_JSON="[]"
PREVENT_SELF_REVIEW="false"

if [ -n "${REVIEWER_USERNAME}" ]; then
  REVIEWER_ID="$(
    curl -fsSL \
      "${COMMON_HEADERS[@]}" \
      "${API_ROOT}/users/${REVIEWER_USERNAME}" \
      | jq -r '.id'
  )"

  if [ -z "${REVIEWER_ID}" ] || [ "${REVIEWER_ID}" = "null" ]; then
    echo "Could not resolve reviewer user ID for ${REVIEWER_USERNAME}." >&2
    exit 1
  fi

  REVIEWERS_JSON="$(
    jq -nc \
      --argjson id "${REVIEWER_ID}" \
      '[{type: "User", id: $id}]'
  )"
  PREVENT_SELF_REVIEW="true"
fi

PAYLOAD="$(
  jq -nc \
    --argjson reviewers "${REVIEWERS_JSON}" \
    --argjson prevent_self_review "${PREVENT_SELF_REVIEW}" \
    '{
      wait_timer: 0,
      reviewers: $reviewers,
      prevent_self_review: $prevent_self_review,
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: false
      }
    }'
)"

curl -fsSL \
  -X PUT \
  "${COMMON_HEADERS[@]}" \
  "${API_ROOT}/repos/${REPOSITORY}/environments/${ENVIRONMENT_NAME}" \
  -d "${PAYLOAD}" \
  >/dev/null

echo "Configured GitHub environment '${ENVIRONMENT_NAME}' for ${REPOSITORY}."
if [ -n "${REVIEWER_USERNAME}" ]; then
  echo "Required reviewer: ${REVIEWER_USERNAME}"
fi
