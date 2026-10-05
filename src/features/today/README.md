# `features/today`

Owns the main screen: the shown day's figures, the bowl, the week strip, the quick-add buttons and the Track with
AI button, and the Add/Remove and cap pop-ups. It holds no data of its own. Every number is read from
`@/features/tracking` and read back from SQLite after each write.

## Who depends on it

The entry route, `app/index.tsx`, renders `TodayScreen` and passes the four navigation handlers in: the calendar,
Track with AI, the top-up pop-up and the cap pop-up. The last three receive the shown day's key and pass it on as the
route's `day` parameter. `app/top-up.tsx` and `app/edit-cap.tsx` render the pop-ups for the day that parameter names.
So this feature names no route.

## Decisions that outlive the pull request

- **Switching days** (owner's intake-2; Manager decisions, day-switching, 2026-10-04):
  - A swipe right on the screen below the week strip shows the day before, and a swipe left the day after. Tapping a
    week-strip day selects it. The range runs from a year back (365 days, tracking's `earliestLoggableDayKey`) to
    today: tomorrow's cell is disabled, a swipe left on today stays on today, and a swipe right a year back stays
    there. A drag counts once it moves 60pt, or flicks at
    500pt/s; a vertical drag never does.
  - The shown day drives Eaten, Left, the bowl, the overage selector and the cap label. Quick add, Add/Remove,
    the cap pop-up and Track with AI write to it. A past day never logged takes the current cap.
  - Today stays shown across midnight; a past day picked stays picked.
  - Until a newly shown day is read, the last day read stays on screen, so a swipe never blanks the screen. Every
    action writes to the day on screen.
  - The bowl is keyed by its day, so each switch re-drops that day's balls.
  - **Haptics** (owner's intake-5; Manager defaults, 2026-10-05): a swipe that changes the day ticks a selection haptic
    once, and none at either end of the range. Quick add and the top-up's Add tap a light impact once the entry is
    stored, and never for a write that failed. A week-strip tap, Remove and a cap edit play none. iOS's System Haptics
    setting governs (`modules/haptics`).
  - Editing a cap from a past day sets that day's cap alone. From today it also sets the daily cap, as before.
  - Opened from a past day, the cap pop-up shows the day's date under its title and the Add/Remove pop-up shows it
    level with the check, in the caption style (`text-caption`, `content-muted`). Opened from today, both stay as
    Figma draws them (5:70, 5:1613, 8:3092). Manager ruling on qa f-fbf806.
  - The overage selector reads "Yesterday's overage" on today and "The previous day's overage" on a past day.
- **Quick add is +5, +25 and +100**, then other (owner's intake-6), and the screen's spacing follows frame 1:2 as the
  owner revised it on 2026-10-05. The other main-screen frames (5:1744, 5:1869, 5:2069, 5:2154, 9:4038) still draw
  the earlier spacing and +25, +50, +100; where they disagree with 1:2, the screen follows 1:2.
- **Figures** come from tracking's `dayFigures`, shown as stored, because today becomes a past day the
  calendar shows unclamped (Lead ruling U6, main-screen second to merge). Eaten is the day's net entries and
  never counts an added carry-over (Figma 5:2069 shows 0 eaten with +400 added); a day stored below zero
  shows "-300". Left is the cap minus the total, never below 0, so a negative day leaves more than the cap.
  The day is over the cap when its total is above the cap. A total at or below 0 draws the empty bowl.
- **The default cap** (1200) is stored on first launch by tracking's `useEnsureDailyCap`, which this
  screen calls. The value awaits the owner (main-screen request [3]).
- **The bowl is a physics pile, never a layout** (the owner's spec, backlog #5). Its track is Figma's full
  bowl, 5:2025 (361 x 160), and the same curves are its collision walls. Balls fall under gravity, bounce
  off each other livelier than off the bowl, knock the balls they land on, and settle; no ball has a set
  place, so the pile differs every time (owner, 2026-10-04: "some bounce and interaction between balls").
  The simulation runs on the UI thread and stops once nothing moves. There, a worklet holds the worklets it
  calls as they were when its module loaded, because react-native-worklets builds them in source order. So each
  is declared below every worklet it calls: one declared later is `undefined` on the device alone (qa f-cee43c,
  any small overflow threw). `src/config/worklet-closures.test.ts` builds the modules as Metro does and fails on it.
- **With reduce motion on, nothing streams and the pile appears at rest.** The stream exists to be watched,
  and unseen it only delays the bowl behind the figures (qa f-7f1f58: 7.9s for +3000). So removals happen at
  once, new pile balls fall together as one column above the bowl, and overflow appears anywhere outside the
  track between the ground and the rims, then all of it settles by physics out of sight, on at most 6ms of
  the UI thread per frame. Over 40 seeds 0 to 2400 rests 1.8s after the change at the median and 3.1s at
  worst (8.4s streamed), 1200 to 1600 in 1.2s (4.4s). The bowl draws a copy of the world taken when it rests, so
  nothing unsettled is ever shown. A day switch mounts a fresh world (f-1076d2, measured ~6s of a wrong half-placed
  picture on the simulator before): it shows no balls until it first rests, places its pile bottom up inside the
  bowl rather than in a column above it, and gets 24ms of each frame until then; over 40 seeds a fresh 1200 with a
  400 carry-over rests in 1.70s at the median and 2.18s at worst (2.02s and 3.07s before), 1600 in 1.50s and
  2.20s, 2400 in 1.47s and 2.15s. The setting is read through Reanimated's hook, which
  reads it when the app starts, so a change to it applies from the next launch (REACT-125 names that hook).
- **Counts.** A full bowl is 100 balls: `round(min(total, cap) / cap * 100)`, and at least one. Over the
  cap the bowl stays full and the overage is coral overflow at the same scale, at least one and at most 50.
  An empty day (a total at or below 0) shows 5 dark decorative balls. An added carry-over is coral, counted
  in the 100 (Manager ruling under the owner's 2026-10-04 delegation).
- **Changes are drops and removals, never a re-layout.** A rise drops only the new balls, one every 20ms
  from above the bowl. A fall removes the highest ball first, overflow before the pile. The decorative balls
  leave before the first drop and return after the last removal.
- **Any single change finishes dropping within about 2.5s of the tap** (Manager decision (a), 2026-10-05, f-e8f6dd:
  a big overage trickled out at ~95ms a red, so 0 to 2400 rested 8.3s after the tap). A change with no overflow pours
  as above, at most 100 balls in 2s. A change that overflows pours its pile within 0.6s, from two rows a ball apart,
  and an overflow of more than 16 balls sheds in volleys: each step a volley of up to 3 over one rim (at the shed spot,
  one above it, one outward, all thrown alike and 1.5x as hard, so none knocks another back in flight) and one fewer
  over the other, starting once 60% of the pile is left to drop. Only the members with clear air are shed, because a
  pile ball can rest at a crown for seconds. The rims mostly alternate the bigger volley; once the two piles differ by
  2 the lighter rim sheds alone. Measured over 40 seeds on a 402pt screen, from the settled day before: the last ball
  is released 0 to 2400 (and 3200) in 2.07s at the median and 2.23s at worst (7.33s and 7.68s before), 1200 to 1800
  in 1.58s at worst (5.08s), 1200 to 1600 in 1.03s (3.32s), 1600 to 3200 in 0.63s (1.72s); removals were already
  quick, 3200 to 0 in 2.18s and 2400 to 1200 in 0.88s. Settling after the last ball takes at most 1.90s on these
  paths. No red rests inside, the two piles differ by at most 3, and no coral rests above a white. Unseen (reduce
  motion) is unchanged.
- **The carry-over is a colour, not a layer** (Manager ruling on request [1], option D). The pile's lowest N
  balls by height are coral, N being the carry-over's count, and the rest are white. A change in N re-colours
  the balls at that boundary over 150ms and re-pours nothing (spec 17 forbids replacing the group). Coral
  drops only when the pile that stays is smaller than the carry-over, so into an empty bowl it drops first.
  Coral poured in with the white can come to rest above a white ball, so the first time a change rests the
  lowest N are taken again, with the same fade, and only then: a rested pile still creeps, and a later fade
  would start after the frame loop stopped (qa f-c41dc0, f-cb93b2). Over 40 seeds on 11 paths no coral rests
  above a white; at most one ball, level with its neighbour, sits a fraction of a pixel out of order.
- **Overflow is shed over the rims** (Manager ruling on request [0], option A). Each red starts 26px above
  the rims, 4 to 12px inside a crown, thrown outward at 120-170px/s and up at 60-110px/s, so the pile seems to
  shed it. Each ball switches rim with probability 0.7. A red slides without friction on anything but level
  ground (friction balanced reds on a crown, and the next one rolled off them into the bowl), and bounces at
  0.5 off everything it hits. Measured over 40 seeds on a 402pt screen, no red ever settled inside the bowl, whether poured 0 to 2400 at
  once, 1200 to 1600, or 400 at a time to 2400, and the two piles differ by at most 3 balls. Settling after
  the last red took 1.18 to 1.28s at the median and 2.15s at worst.
- **The ground runs to the screen's edges.** The canvas is the window's width, and walls at its edges stop
  the overflow piles, so a red never leaves the screen.
- **An invisible lid over the rims** holds the eaten balls in a full bowl: an arc 26px above the rims at
  the middle and 8px at their ends. A fast pour otherwise piles balls up the walls and over the rims.
- **The track.** Under the cap, a white arc covers the share of the cap used along the track's centre
  line, from the bottom out (Lead ruling on f-451aa0: linear in the share). Over the cap the whole track
  turns coral. Both change over 400ms.
- **Skia draws the bowl** (`@shopify/react-native-skia`): the track and every ball are one canvas,
  redrawn only while the pile moves. Jest maps the package to an empty canvas (`tests/skia.mock.tsx`).
- **9:4038's text contradicts its bowl.** It reads "Eaten 0 / 800 left" over an over-cap bowl, copied
  from 5:2069. For a 400 kcal carry-over plus 1200 eaten, the screen shows Eaten 1200 and 0 left.
- **The week strip** runs from 13 days before today to tomorrow. A day shown further back widens it to a week
  before that day, never before a year back. Today and tomorrow are placed by position. Every other day takes tracking's shared `dayStatus`
  rule. The shown day is kept centred where the strip can scroll that far, so on today the strip rests at its end.
- **The selected day is undrawn.** Figma 5:2526 has no selected variant: the main screen only ever showed today, on
  today's pill. So the shown day takes the pill (`bg-surface-selected`) and a white weekday, and keeps its own
  state's circle. Today keeps its white circle when another day is shown.
- **The pop-ups are native form sheets** (`app/top-up.tsx`, `app/edit-cap.tsx`, presented by the root
  layout). They size to their content, have the system grabber, and dismiss with a swipe down without storing
  anything, because nothing is written until the check. On iOS 26 a transparent form sheet takes the system's
  glass, which is what Figma draws (5:70, 5:1613, 8:3092). The keyboard is the system number pad, not a drawn
  one. An amount is digits only. A keystroke that would pass 10,000 is refused, not clamped. The check stays
  disabled at empty or 0, and stores once however fast it is pressed.
- **The amount's text has the font's own line height** (token `amount`, 80px). An iOS TextInput whose line
  height is below the font's clips its digits. For the same reason the top-up's +/- sign is a read-only field:
  as a Text it sits about 28px below the digits.
- **A disabled check is drawn at 50% opacity.** Figma draws no disabled state.
- **Remove never takes a day below zero** (Lead ruling on f-8aebf1). The Remove tab accepts at most what
  the shown day shows eaten. A keystroke past that is refused, and an amount above it (typed on Add) disables the
  check. With 0 or less eaten, Remove accepts nothing. Storage refuses such a removal as well (the owner's
  answer to foundation request [4]), so one that loses a race to another write shows as a failed save.
- **A pop-up opened by a link** (justcalorie://top-up) opens over the main screen, because the root stack
  is anchored on `index` (`src/config/navigation.ts`). Closing a pop-up goes back, or to `/` when there is
  nothing to go back to.
- **A failed write is never silent.** A pop-up stays open with "Couldn't save. Try again." under the amount,
  and its check works again. Quick add and the overage selector show an alert. All three log the error.
- **Copy is English literals**, as in Figma. The app has no copy catalogue yet.
