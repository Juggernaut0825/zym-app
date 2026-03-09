#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running production regression via TEST.sh ..."
"$ROOT_DIR/TEST.sh"
