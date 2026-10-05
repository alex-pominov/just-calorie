#!/usr/bin/env bash
# Exercises the sign-in callback listener's Swift (modules/loopback-callback/ios) on this Mac, without a device:
# compiles it with modules/loopback-callback/probe/main.swift into a throwaway binary and probes it over HTTP.
# Usage: scripts/probe-loopback-listener.sh. Prints every check it ran; exits non-zero when any fails.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SOURCES="$ROOT/modules/loopback-callback/ios"
WORK=$(mktemp -d)
FALLBACK_TIMEOUT_MS=5000
STARTED_PIDS=()
PASSED=0
FAILED=0

cleanup() {
  for pid in "${STARTED_PIDS[@]:-}"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

check() {
  local name=$1 expected=$2 actual=$3

  if [[ "$actual" == "$expected" ]]; then
    PASSED=$((PASSED + 1))
    echo "[probe] PASS $name"
  else
    FAILED=$((FAILED + 1))
    echo "[probe] FAIL $name: expected '$expected', got '$actual'"
  fi
}

# Starts one listener; sets LISTENER_PID, LISTENER_PORT and LISTENER_LOG.
start_listener() {
  local state=$1 port=$2 timeout_ms=$3

  LISTENER_LOG="$WORK/listener-$state.log"
  "$WORK/probe" "$state" "$port" "$timeout_ms" >"$LISTENER_LOG" 2>&1 &
  LISTENER_PID=$!
  STARTED_PIDS+=("$LISTENER_PID")
  disown "$LISTENER_PID"

  for _ in $(seq 1 50); do
    grep -q -E '^(STARTED|START-FAILED)' "$LISTENER_LOG" && break
    sleep 0.1
  done

  LISTENER_PORT=$(sed -n 's/^STARTED port=\([0-9]*\)$/\1/p' "$LISTENER_LOG")
  [[ -n "$LISTENER_PORT" ]] || { echo "[probe] FAIL could not start a listener: $(cat "$LISTENER_LOG")"; exit 1; }
}

status_of() {
  curl --noproxy '*' -s -o /dev/null -w '%{http_code}' --max-time 3 "$@" || true
}

listening_on() {
  lsof -nP -a -p "$1" -iTCP -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n//p' | paste -sd ',' -
}

refused() {
  python3 -c 'import socket,sys
try:
    socket.create_connection((sys.argv[1], int(sys.argv[2])), timeout=2).close(); print("connected")
except OSError: print("refused")' "$1" "$2"
}

# Opens <count> connections to the port and sends nothing on them, for <seconds>, in the background.
hold_idle() {
  python3 -c 'import socket,sys,time
held=[socket.create_connection(("127.0.0.1", int(sys.argv[1]))) for _ in range(int(sys.argv[2]))]
time.sleep(float(sys.argv[3]))' "$1" "$2" "$3" &
  HOLDER_SOCKETS_PID=$!
  STARTED_PIDS+=("$HOLDER_SOCKETS_PID")
  disown "$HOLDER_SOCKETS_PID"
  sleep 0.5
}

# Sends the right callback to 127.0.0.1 from a socket bound to <source>; prints whether anything came back.
answer_from_source() {
  python3 -c 'import socket,sys
s=socket.socket()
s.settimeout(5)
s.bind((sys.argv[1], 0))
s.connect(("127.0.0.1", int(sys.argv[2])))
s.sendall(("GET /auth/callback?state=" + sys.argv[3] + "&code=c HTTP/1.1\r\nHost: 127.0.0.1:" + sys.argv[2] + "\r\n\r\n").encode())
try:
    print("answered" if s.recv(64) else "no answer")
except OSError:
    print("no answer")' "$1" "$2" "$3"
}

# Seconds until the listener closes a connection that sends nothing.
idle_close_seconds() {
  python3 -c 'import socket,sys,time
s=socket.create_connection(("127.0.0.1", int(sys.argv[1])))
s.settimeout(30)
start=time.time()
try:
    s.recv(1)
except OSError:
    pass
print(round(time.time()-start))' "$1"
}

xcrun swiftc -swift-version 5 -O -o "$WORK/probe" \
  "$SOURCES/CallbackRequest.swift" "$SOURCES/LoopbackSession.swift" "$SOURCES/LoopbackCallbackServer.swift" \
  "$ROOT/modules/loopback-callback/probe/main.swift"

# macOS treats every local process as local, so only the source can show this: on iOS the setting resets real
# loopback peers (f-e41a92).
check "the listener does not set acceptLocalOnly" "absent" "$(grep -q -E 'acceptLocalOnly[[:space:]]*=' "$SOURCES"/*.swift && echo present || echo absent)"

start_listener state-main 1455 30000
PORT=$LISTENER_PORT
MAIN_PID=$LISTENER_PID
MAIN_LOG=$LISTENER_LOG
CALLBACK="http://127.0.0.1:$PORT/auth/callback"

check "binds 127.0.0.1 only" "127.0.0.1:$PORT" "$(listening_on "$MAIN_PID")"
check "IPv6 loopback is refused" "refused" "$(refused ::1 "$PORT")"
LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [[ -n "$LAN" ]]; then
  check "the LAN address $LAN is refused" "refused" "$(refused "$LAN" "$PORT")"
else
  echo "[probe] SKIP the LAN address check: this Mac has no en0/en1 address"
fi
check "another path is 404" "404" "$(status_of "http://127.0.0.1:$PORT/callback?state=state-main&code=c")"
check "a POST is 405" "405" "$(status_of -X POST "$CALLBACK?state=state-main&code=c")"
check "another state is 400" "400" "$(status_of "$CALLBACK?state=state-other&code=c")"
check "no state is 400" "400" "$(status_of "$CALLBACK?code=c")"
check "a repeated state is 400" "400" "$(status_of "$CALLBACK?state=state-main&state=state-main&code=c")"
check "a foreign Host is 400" "400" "$(status_of -H 'Host: attacker.example' "$CALLBACK?state=state-main&code=c")"
check "an oversized request head is 431" "431" "$(status_of -H "X-Pad: $(head -c 9000 /dev/zero | tr '\0' a)" "$CALLBACK?state=state-main&code=c")"
# The kernel lets a local socket bound to the LAN address reach 127.0.0.1; only the listener's own peer check refuses it
# (qa f-20f7a8). Off-host packets never reach 127/8 at all.
if [[ -n "$LAN" ]]; then
  check "a callback sent from a non-loopback source gets no answer" "no answer" "$(answer_from_source "$LAN" "$PORT" state-main)"
else
  echo "[probe] SKIP the non-loopback source check: this Mac has no en0/en1 address"
fi
check "refusals do not end the wait" "STARTED port=$PORT" "$(cat "$MAIN_LOG")"

kill -USR1 "$MAIN_PID" 2>/dev/null || true
sleep 0.5
check "a reopen rebinds the same port on 127.0.0.1 only" "127.0.0.1:$PORT" "$(listening_on "$MAIN_PID")"

check "a connection that sends nothing is closed within 3 s" "yes" "$([[ $(idle_close_seconds "$PORT") -le 3 ]] && echo yes || echo no)"

# A local process holding every connection slot idle must not deny the browser's callback (qa f-6d2a95).
hold_idle "$PORT" 8 6
PAGE=$(curl --noproxy '*' -s -i --max-time 3 "$CALLBACK?code=secret%2Bcode&scope=openid+email&state=state-main&client_id=oaiapp_probe" || true)
check "the callback is answered 200" "HTTP/1.1 200 OK" "$(printf '%s' "$PAGE" | head -1 | tr -d '\r')"
check "the page sends the user back to the app" "yes" "$(grep -q 'Return to Just Calorie to finish. You can close this page.' <<<"$PAGE" && echo yes || echo no)"
check "the page claims no outcome it cannot know" "no" "$(grep -q -i 'signed in' <<<"$PAGE" && echo yes || echo no)"
check "the page never echoes the code" "no" "$(grep -q 'secret' <<<"$PAGE" && echo yes || echo no)"
sleep 0.5
check "the callback reaches the caller form-decoded" "CALLBACK client_id=oaiapp_probe&code=secret+code&scope=openid email&state=state-main" "$(sed -n 's/^\(CALLBACK .*\)$/\1/p' "$MAIN_LOG")"
check "the port is closed after the callback" "refused" "$(refused 127.0.0.1 "$PORT")"

start_listener state-denied 1455 30000
DENIED_PAGE=$(curl --noproxy '*' -s --max-time 3 "http://127.0.0.1:$LISTENER_PORT/auth/callback?error=access_denied&state=state-denied" || true)
check "a declined consent gets the same page as any accepted callback" "same" "$([[ "$DENIED_PAGE" == "$(printf '%s' "$PAGE" | sed '1,/^\r$/d')" ]] && echo same || echo different)"

start_listener state-holder 1455 30000
HOLDER_PORT=$LISTENER_PORT
# Long enough for lsof to read the listener before it times out; a loaded Mac takes seconds per lsof.
start_listener state-fallback "$HOLDER_PORT" "$FALLBACK_TIMEOUT_MS"
FALLBACK_PID=$LISTENER_PID
check "a taken port falls back to another port" "different" "$([[ "$LISTENER_PORT" != "$HOLDER_PORT" ]] && echo different || echo same)"
check "the fallback port binds 127.0.0.1 only" "127.0.0.1:$LISTENER_PORT" "$(listening_on "$FALLBACK_PID")"
for _ in $(seq 1 100); do
  grep -q '^REJECTED' "$LISTENER_LOG" && break
  sleep 0.1
done
check "a listener nobody calls times out" "REJECTED ERR_LOOPBACK_TIMEOUT" "$(sed -n 's/^\(REJECTED .*\)$/\1/p' "$LISTENER_LOG")"
check "the port is closed after the timeout" "refused" "$(refused 127.0.0.1 "$LISTENER_PORT")"

echo "[probe] $((PASSED + FAILED)) checks examined: $PASSED passed, $FAILED failed"
[[ "$FAILED" -eq 0 ]]
