#!/usr/bin/env bash
# Seeds the Calendar's day states into the app's SQLite database on ONE simulator. Development only: the app writes
# one past day at a time, and a seed path inside the app would ship.
#
#   scripts/seed-calendar-sim.sh seed                       every day from the 1st of last month to yesterday
#   scripts/seed-calendar-sim.sh set-day YYYY-MM-DD <kcal>  one past day's entries become one add of <kcal> (0 clears them)
#
# SIM_UDID picks the simulator; without it, the one booted simulator, refusing when none or several are booted. The
# app must have launched once, so its migrations created the database. The app is terminated first. Plain INSERT/UPDATE/DELETE into the
# existing tables only: no schema change, and PRAGMA user_version is read, never written.
set -euo pipefail

SCHEMA_VERSION=1
CAP_KCAL=2000
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")

fail() { echo "[seed] FAIL: $*" >&2; exit 1; }

# With two booted, 'booted' would mean either one, so the script never picks between them.
if [[ -z "${SIM_UDID:-}" ]]; then
  BOOTED_UDIDS=$(xcrun simctl list devices booted -j | node -e '
    let json = "";
    process.stdin.on("data", (chunk) => (json += chunk)).on("end", () => {
      for (const devices of Object.values(JSON.parse(json).devices)) {
        for (const device of devices) if (device.state === "Booted") console.log(device.udid);
      }
    });')
  BOOTED_COUNT=$(printf '%s\n' "$BOOTED_UDIDS" | grep -c . || true)
  [[ "$BOOTED_COUNT" -eq 1 ]] ||
    fail "$BOOTED_COUNT simulators are booted; boot one, or name it with SIM_UDID=<udid> (xcrun simctl list devices)"
  SIM_UDID=$BOOTED_UDIDS
fi

DATA_DIR=$(xcrun simctl get_app_container "$SIM_UDID" "$BUNDLE_ID" data 2>/dev/null) ||
  fail "$BUNDLE_ID is not installed on $SIM_UDID; build it there first"
DB_FILES=$(find "$DATA_DIR" -type f -name 'just-calorie.db' -not -path '*/tmp/*')
[[ $(printf '%s\n' "$DB_FILES" | grep -c . || true) -eq 1 ]] ||
  fail "expected exactly one just-calorie.db under $DATA_DIR, found: ${DB_FILES:-none}. Launch the app once first"
DB=$DB_FILES

xcrun simctl terminate "$SIM_UDID" "$BUNDLE_ID" 2>/dev/null || true

APPLIED_VERSION=$(sqlite3 -bail "$DB" 'PRAGMA user_version;')
[[ "$APPLIED_VERSION" == "$SCHEMA_VERSION" ]] ||
  fail "the database is at schema version $APPLIED_VERSION; this seed writes version $SCHEMA_VERSION's columns"

TODAY="date('now', 'localtime')"
FIRST="date('now', 'localtime', 'start of month', '-1 month')"
last_month_end() { echo "date('now', 'localtime', 'start of month', '-$(( $1 + 1 )) days')"; }
this_month() { echo "date('now', 'localtime', 'start of month', '+$1 days')"; }

seed() {
  sqlite3 -bail "$DB" <<SQL
BEGIN IMMEDIATE;
INSERT INTO settings (id, daily_cap_kcal) VALUES (1, $CAP_KCAL)
  ON CONFLICT (id) DO UPDATE SET daily_cap_kcal = excluded.daily_cap_kcal;

DELETE FROM entries WHERE day_key >= $FIRST AND day_key < $TODAY;
DELETE FROM days WHERE day_key >= $FIRST AND day_key < $TODAY;

WITH RECURSIVE span(day_key) AS (
  SELECT $FIRST WHERE $FIRST < $TODAY
  UNION ALL SELECT date(day_key, '+1 day') FROM span WHERE date(day_key, '+1 day') < $TODAY
)
INSERT INTO days (day_key, cap_kcal, carry_over_kcal) SELECT day_key, $CAP_KCAL, 0 FROM span;
INSERT INTO entries (day_key, kind, kcal)
  SELECT day_key, 'add', 1200 FROM days WHERE day_key >= $FIRST AND day_key < $TODAY;

-- Last month's final week: over, carry-over only, a removal, exactly at the cap, no row at all.
-- The removal leaves the day above 0, as the app's own write requires.
UPDATE entries SET kcal = 2500 WHERE day_key = $(last_month_end 5);
DELETE FROM entries WHERE day_key = $(last_month_end 4);
UPDATE days SET carry_over_kcal = 500, carry_over_added = 1 WHERE day_key = $(last_month_end 4);
UPDATE entries SET kcal = 1100 WHERE day_key = $(last_month_end 3);
INSERT INTO entries (day_key, kind, kcal) VALUES ($(last_month_end 3), 'remove', 300);
UPDATE entries SET kcal = 2000 WHERE day_key = $(last_month_end 2);
DELETE FROM entries WHERE day_key = $(last_month_end 1);
DELETE FROM days WHERE day_key = $(last_month_end 1);

-- This month, where those days are already past: over, then a day carrying its overage.
UPDATE entries SET kcal = 2600 WHERE day_key = $(this_month 1);
UPDATE entries SET kcal = 1500 WHERE day_key = $(this_month 2);
UPDATE days SET carry_over_kcal = 600 WHERE day_key = $(this_month 2);
COMMIT;
SQL
}

set_day() {
  local day=$1 kcal=$2

  [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "the day must be written YYYY-MM-DD"
  [[ "$kcal" =~ ^[0-9]+$ ]] && (( kcal <= 10000 )) || fail "kcal must be a whole number from 0 to 10000"
  [[ $(sqlite3 "$DB" "SELECT date('$day') = '$day' AND '$day' < $TODAY;") == 1 ]] ||
    fail "$day is not a calendar date before the simulator's today"

  sqlite3 -bail "$DB" <<SQL
BEGIN IMMEDIATE;
INSERT OR IGNORE INTO days (day_key, cap_kcal, carry_over_kcal)
  VALUES ('$day', (SELECT daily_cap_kcal FROM settings WHERE id = 1), 0);
DELETE FROM entries WHERE day_key = '$day';
INSERT INTO entries (day_key, kind, kcal) SELECT '$day', 'add', $kcal WHERE $kcal > 0;
COMMIT;
SQL
}

report() {
  echo "[seed] $DB (user_version $(sqlite3 "$DB" 'PRAGMA user_version;'), today $(sqlite3 "$DB" "SELECT $TODAY;"))"
  sqlite3 -bail -separator ' ' "$DB" <<SQL
SELECT '[seed] cap', daily_cap_kcal FROM settings WHERE id = 1;
SELECT '[seed] rows from ' || $FIRST || ' to yesterday:', COUNT(*) FROM days WHERE day_key >= $FIRST AND day_key < $TODAY;
SELECT '[seed]  ', days.day_key, 'entries=' || COUNT(entries.id),
  'total=' || (COALESCE(SUM(CASE entries.kind WHEN 'add' THEN entries.kcal ELSE -entries.kcal END), 0)
    + CASE days.carry_over_added WHEN 1 THEN days.carry_over_kcal ELSE 0 END),
  'cap=' || days.cap_kcal, 'carry=' || days.carry_over_kcal || COALESCE('/added=' || days.carry_over_added, '')
FROM days LEFT JOIN entries ON entries.day_key = days.day_key
WHERE days.day_key >= $(last_month_end 6) AND days.day_key < $TODAY
GROUP BY days.day_key ORDER BY days.day_key;
SQL
}

case "${1:-}" in
  seed) seed ;;
  set-day) [[ $# -eq 3 ]] || fail "usage: $0 set-day YYYY-MM-DD <kcal>"; set_day "$2" "$3" ;;
  *) fail "usage: $0 seed | set-day YYYY-MM-DD <kcal>" ;;
esac

report
echo "[seed] OK — reopen the app: xcrun simctl openurl $SIM_UDID justcalorie://calendar"
