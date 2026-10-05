# `features/calendar`

The Calendar screen at `/calendar` and its model: every month from the earliest recorded day through one month after the
current one, laid out as Monday-first weeks, with each day in one of the five states frame `9:3396`
draws (on track, over, unfilled, today, future) and the figure it shows. Days are display-only.

## Who depends on it

The `/calendar` route, through `index.ts`: it renders `CalendarScreen`. The main screen's calendar
icon (main-screen workstream) navigates there. Nothing imports the feature otherwise.

## Constraints

- **The day-status rule and the multi-day read are tracking's**, shared with the main screen
  (`dayStatus`, `useDaySummaries`). `hooks/useCalendarDays.ts` is the only file that reads stored days
  or judges one; the rest of the feature works on its plain `{ status, totalKcal }` records.
- **The earliest recorded day is read by tracking's `useEarliestDayKey`**, which this feature added: the
  shared read takes an explicit range and returns every day in it, so it cannot say where the range
  should start, and the `days` table it reads is tracking's. The read runs from the 1st of that day's
  month (or of the current month) through today; later days need no data.
- **Position decides before status.** The current day is today and a later day is future, whatever is
  stored for them (`deriveCalendarDayState`). That rule, the figure, the month range and the week
  start are this feature's.
- **Owner rulings** (workstream `calendar`: request [1] approved the defaults, request [3] added the
  year); each is one line:
  - the figure is the day's stored total, shown unclamped when negative; an unfilled day shows its
    total dimmed, so `0` with no row and its added carry-over when it has no entries;
  - the range starts at the earliest recorded month and shows one upcoming month
    (`UPCOMING_MONTH_COUNT`);
  - weeks start on Monday (`FIRST_WEEKDAY`);
  - a month title is its name, plus its year outside the current year (`October 2025`, `monthTitle`).
    A day's screen-reader label keeps the month name alone; its month's title is the heading above it.
- **The header overlays the months**, so the list waits for the header's measured height before it
  renders: that height pads the list and places the current month 104pt below the header on open,
  as frame `9:3396` shows it. The header's backdrop blur comes from `expo-blur`, a native module, so
  adding or upgrading it needs a new development build.
- **Close goes back when there is history** and replaces the route with `/` otherwise, so a deep link
  straight to `/calendar` still closes to the main screen.
- **The calendar is a full-screen page that slides up from the bottom** and back down when closed (owner's intake-8;
  `FULL_SCREEN_OPTIONS` in `src/config/navigation.ts`). iOS's full-screen presentation has no swipe to dismiss, so
  Close is the way out.
- **Calendar arithmetic runs in UTC**, where a daylight-saving change cannot skip or repeat a day.
  Day keys are the device's local dates, so this only decides how they are laid out.
