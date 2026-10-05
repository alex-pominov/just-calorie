# `features/tracking`

Owns the calorie log: each day's entries (kcal added and removed), the daily cap, and the carry-over
of one day's overage into the next. All of it is stored on the device in SQLite, through
`@/modules/database`. Nothing here talks to a server.

## Who depends on it

Routes and other features use it only through `index.ts`: the day-summary and multi-day hooks, the action
hooks, the today-key hook, the day-figures and day-status rules, and the dev seed. Every value a hook
returns is read back from SQLite after each write. A consumer never keeps its own copy of a total, so
two screens cannot show different numbers.

- **The main screen** (`features/today`) reads the shown day's summary, its figures and the week strip, and
  writes to the shown day.
- **The routes** turn a link's `day` parameter into the day a pop-up or `/track` writes to through
  `useLoggableDayKey`: that day when it is a valid key from a year back (`earliestLoggableDayKey`, 365 days) to
  today, otherwise today. No write reaches a day outside that range from the app. A day older would make the
  calendar read every day from it on each write (qa f-437fa1). The day is resolved when the screen opens and kept
  across midnight, so an amount typed just before it lands on the day the screen showed, even when that day has
  just passed out of range (qa f-004498).
- **The calendar workstream** reads the day-status rule and the multi-day read. Both arrived in one
  standalone commit (`11751ac`) that the calendar workstream merges as is, so the rule exists once. A later change to
  those files is again a standalone commit, announced to calendar before it lands.

## Constraints

- **expo-sqlite is reached only through `@/modules/database`** (a lint gateway). Repositories take that
  module's `Database` handle, so their tests run against Node's built-in `node:sqlite`
  (`tests/node-sqlite-database.ts`) with no native code.
- **The tables live in the database module's append-only migration list.** Changing them means adding
  a migration. A migration that has shipped is never edited.
- **A day is judged against its own cap.** `days.cap_kcal` is a snapshot taken when the day is first
  written to, so a past day logged for the first time takes the current daily cap. `setDailyCap` updates the
  settings and the snapshot of the day passed in (today), if that day is recorded. `setDayCap` sets one day's
  snapshot alone, recording the day if it is new, and leaves the settings untouched. Every other day keeps its
  snapshot.
- **Day keys are local calendar dates** (`YYYY-MM-DD` in the device time zone), computed from an
  instant that is passed in. Only `useTodayKey` reads the clock, and it rolls over at local midnight.
  `entries.created_at` is stamped by SQLite.
- **Bounds:** an entry and a cap are whole numbers from 1 to `MAX_KCAL` (10,000). Anything else is
  refused with `InvalidKcalError`, never clamped.
- **A day's net entries never go below 0** (owner answer to foundation request [4]). `addEntry` refuses a
  removal larger than the day's entries with `RemovalExceedsEatenError` and stores nothing. The check is a
  condition on the removal's INSERT inside the write's transaction, never a read before it, so two removals
  racing for the same kcal cannot both land. An added carry-over is not eaten and cannot be removed.

## Defaults awaiting an owner decision

- **The default daily cap.** A fresh install stores `DEFAULT_DAILY_CAP_KCAL` (1200) once, through
  `useEnsureDailyCap`, so the first day recorded has a cap to snapshot. The value awaits the owner
  (main-screen request [3]). It is a write, never a migration, and it never overwrites a stored cap.
- **What fills a day.** `dayStatus` calls a day with no entry rows `unfilled`, even when a carry-over
  decision recorded it. That follows the calendar's draft, which the owner was asked about first, and it is
  the one case the owner may overturn.
- **The carry-over rule.** `computeCarryOverKcal` (`services/carry-over.service.ts`) is the only place
  the rule lives. Carry-over is the previous day's total above its cap, and never negative. That total
  is its entries plus its own carry-over if it was added, so overage chains. No previous day, or a
  previous day with no cap, carries nothing. A different rule is an edit to that one function.
- **When carry-over is recomputed** (Manager decision, day-switching, 2026-10-04). It is stored on the day's first
  write: an entry, a carry-over decision or a cap. Until then the summary computes it live from the previous day
  (`isRecorded: false`). Every later write to a day (an entry, a decision, a cap) recomputes the stored carry-over of
  the days after it, in order, in the same transaction, so editing a past day moves the whole chain after it. The walk
  stops at the first day not recorded, which carries nothing whatever came before it, or at the first carry-over left
  unchanged, since every day after that one is unchanged too. That holds for a chain the app wrote; a chain written
  around the app (the simulator seed script) is repaired only where an edit's walk reaches it. A day's carry-over decision survives a recompute: a day
  that added its carry-over adds the new amount. No schema change: `user_version` stays 1.
- **How a negative day is shown.** Only a day stored before removals were refused can be below 0. It is
  shown as stored, the same way the calendar shows a past day (Lead ruling U6, second to merge):
  `dayFigures` gives eaten as the net entries total, and left as `max(0, cap - total)` with no upper
  limit, so -300 eaten against 1200 leaves 1500.

## Development seed

`seedScenario` replaces every stored row with one of the main screen's state frames, relative to today,
through this feature's own write functions. It is reached only from a `__DEV__` route.
