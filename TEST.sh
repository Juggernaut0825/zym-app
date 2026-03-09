#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$ROOT_DIR/server"
WEB_DIR="$ROOT_DIR/web"
IOS_PROJECT="$ROOT_DIR/ios/ZYM.xcodeproj"
IOS_SCHEME="ZYM"
IOS_DESTINATION="${IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 17}"

cleanup() {
  "$ROOT_DIR/STOP.sh" --silent || true
}
trap cleanup EXIT

echo "== ZYM MVP regression =="
echo ""

echo "[1/5] Stop existing services"
"$ROOT_DIR/STOP.sh" --silent || true

echo "[2/5] Build backend"
(cd "$SERVER_DIR" && npm run build)

echo "[3/5] Build web app"
(cd "$WEB_DIR" && npm run build)

echo "[4/5] Build iOS app"
xcodebuild \
  -project "$IOS_PROJECT" \
  -scheme "$IOS_SCHEME" \
  -sdk iphonesimulator \
  -destination "$IOS_DESTINATION" \
  build >/tmp/zym-ios-build.log
echo "iOS build succeeded"

echo "[5/5] Start prod services and run real E2E"
"$ROOT_DIR/START.sh" prod
(cd "$SERVER_DIR" && node scripts/e2e-real-check.mjs)

echo ""
echo "All regression checks passed."
echo "Services have been stopped."
