#!/usr/bin/env bash
# Launch smoke check for the iOS development build on one booted simulator.
# Usage: scripts/smoke-ios.sh <metro-log> [simulator-udid]
# Without a UDID it runs only when exactly one simulator is booted: with two, 'booted' means either one,
# and the shared bundle id would let the check pass on another worktree's app. It never picks one.
# Fails unless the app process is running, Metro served it an iOS bundle, and the captured
# Metro output holds no error or warning line. Prints what it examined either way.
set -euo pipefail

METRO_LOG=${1:?usage: scripts/smoke-ios.sh <metro-log> [simulator-udid]}
REQUESTED_UDID=${2:-}
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")
PROBLEM_PATTERN='(^|[^A-Za-z])(ERROR|WARN)([^A-Za-z]|$)|Unhandled|Invariant Violation|TypeError|ReferenceError|SyntaxError|LogBox|Render Error'

BOOTED_UDIDS=$(xcrun simctl list devices booted -j | node -e '
  let json = "";
  process.stdin.on("data", (chunk) => (json += chunk)).on("end", () => {
    for (const devices of Object.values(JSON.parse(json).devices)) {
      for (const device of devices) if (device.state === "Booted") console.log(device.udid);
    }
  });')
BOOTED_COUNT=$(printf '%s\n' "$BOOTED_UDIDS" | grep -c . || true)
BOOTED_LIST=$(printf '%s\n' "$BOOTED_UDIDS" | grep . | paste -sd ',' - || true)

if [[ -n "$REQUESTED_UDID" ]]; then
  if ! printf '%s\n' "$BOOTED_UDIDS" | grep -qxF "$REQUESTED_UDID"; then
    echo "[smoke] FAIL: simulator $REQUESTED_UDID is not booted (booted: ${BOOTED_LIST:-none})"
    exit 1
  fi
  DEVICE=$REQUESTED_UDID
elif [[ "$BOOTED_COUNT" -eq 1 ]]; then
  DEVICE=$BOOTED_UDIDS
elif [[ "$BOOTED_COUNT" -eq 0 ]]; then
  echo "[smoke] FAIL: no simulator is booted"
  exit 1
else
  echo "[smoke] FAIL: $BOOTED_COUNT simulators are booted ($BOOTED_LIST); pass the UDID to examine as the second argument"
  exit 1
fi

[[ -s "$METRO_LOG" ]] || { echo "[smoke] FAIL: Metro log $METRO_LOG is missing or empty"; exit 1; }

BUNDLES=$(grep -c 'iOS Bundled' "$METRO_LOG" || true)
PROBLEMS=$(grep -E -n "$PROBLEM_PATTERN" "$METRO_LOG" || true)
RUNNING=$(xcrun simctl spawn "$DEVICE" launchctl list 2>/dev/null | grep -c "UIKitApplication:$BUNDLE_ID" || true)

echo "[smoke] examined $METRO_LOG ($(wc -l < "$METRO_LOG" | tr -d ' ') lines) and the launchd list of simulator $DEVICE"
echo "[smoke] iOS bundles served: $BUNDLES | $BUNDLE_ID processes running: $RUNNING"

FAILED=0
[[ "$BUNDLES" -ge 1 ]] || { echo "[smoke] FAIL: Metro never served an iOS bundle, so the app did not load its JavaScript"; FAILED=1; }
[[ "$RUNNING" -ge 1 ]] || { echo "[smoke] FAIL: $BUNDLE_ID is not running on simulator $DEVICE"; FAILED=1; }

if [[ -n "$PROBLEMS" ]]; then
  echo "[smoke] FAIL: error or warning lines in the Metro output:"
  echo "$PROBLEMS"
  FAILED=1
fi

[[ "$FAILED" -eq 0 ]] && echo "[smoke] OK: launched on $DEVICE, bundle served, 0 error or warning lines"
exit "$FAILED"
