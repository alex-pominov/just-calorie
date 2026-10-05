# `features/track-with-ai`

The Track with AI screen at `/track`, built from Figma frame `9:3192`. The user describes what they ate
and gets a calorie estimate back as a chat reply. **Add** records that estimate as an entry on the day `/track`
was opened for. `app/track.tsx` renders `TrackWithAiScreen` for the day its `day` parameter names.

## Who depends on it

- **The route `/track`** takes `day` (`YYYY-MM-DD`). The main screen's Track with AI button pushes it with the
  shown day. The route reads it through tracking's `useLoggableDayKey`: without it, or with a day after today or
  more than a year back, Add writes to today.
- **It consumes** `estimateCalories` and `EstimateError` from `@/modules/calorie-estimate`, the one
  place the vendor call lives. From `@/features/tracking` it uses `useAddEntry`, `useTodayKey`, `dateName` and `MAX_KCAL`.
  From `@/modules/chatgpt-auth` it uses the session status, sign-in, sign-out and the usage-settings link.

## Behaviour

Each default below is set in one place.

- **The chat lives in memory only, by the owner's ruling** (workstream `track-with-ai`, request [1],
  2026-10-04): there is no chat persistence for now, so the chat starts empty each time `/track` opens
  (`useTrackChat`). Entries that Add records do persist, on their day, through the tracking feature.
- **Sending:**
  - The user's message appears at once, with a spinner in place of the reply.
  - Send is disabled while the field is blank or a reply is outstanding. The return key sends too.
  - The list keeps scrolling to the newest message.
- **A reply:**
  - With a kcal, it is the model's sentence, then the card showing `+N` and **Add**.
  - With no kcal, it is the sentence alone.
  - Above one entry's limit (tracking's `MAX_KCAL`, 10,000), the card shows `+N` with no Add, and a line
    says it is over the limit. The data layer would refuse it, so it is never offered.
- **Errors never crash the screen.** Each failure kind becomes an AI-side line, and the user can send
  again. The copy is in `chat-copy.service.ts`:

  | Failure | Line |
  | --- | --- |
  | nobody signed in (and, in development, no key) | Continue with ChatGPT to get calorie estimates. |
  | no network or a timeout | I couldn't reach the estimate service. Check your connection and try again. |
  | API error | The estimate service returned an error. Please try again in a moment. |
  | ChatGPT usage limit | You've reached your ChatGPT usage limit. You can review it in ChatGPT settings. |
  | ChatGPT plan not usable here (a 403, such as a Free account) | Your ChatGPT plan can't be used for estimates here. You can check your plan in ChatGPT settings. |
  | unreadable response | I couldn't read that estimate. Please try again. |

  A failure that is not an `EstimateError` gets a generic line.
- **Sign in with ChatGPT** (`ChatGPTAccountRow`, above the input row; copy in `chatgpt-account-copy.service.ts`):
  - Signed out, a white **Continue with ChatGPT** pill, the label OpenAI's UI guidelines ask for. It opens
    OpenAI's sign-in and reads **Signing in…**, disabled, until it ends. A cancelled sign-in says nothing; any other
    ending leaves one line under the pill naming why.
  - Signed in, **Using ChatGPT plan**, then **Manage usage** (ChatGPT's usage settings) and **Sign out**. A sign-out
    OpenAI did not confirm says so, and points at ChatGPT settings to disconnect the app.
  - Nothing shows until the Keychain has been read, so the pill never flashes for a signed-in user.
  - Every estimate runs on the signed-in user's ChatGPT plan. In a development build a signed-out chat can still
    estimate on the development key (`modules/calorie-estimate`); a production build cannot.
- **Add:**
  - It records exactly N kcal as an `add` entry on the day `/track` was opened for. Its label and its failure
    line name that day: "today", or a past day's date ("Friday 2 October").
  - On success the pill reads **Added** and is disabled, so one estimate is never added twice.
  - If the write fails, a line under the card says so, and Add stays usable.
- **Close** is the app's `closeSheet` (`src/utils/close-sheet.ts`). It goes back when there is history,
  and otherwise replaces the route with `/`. Closing while a reply is outstanding aborts the request, so
  a reply nobody will read is not billed in full.
- **Photos:**
  - The camera button opens a native sheet: Take photo, Choose from library, Cancel.
  - A picked photo waits above the input row as a removable preview. Send then posts any typed text
    and the photo as one message. A photo alone is enough to send.
  - Cancelling does nothing. A refused camera permission, an unavailable camera or a photo that cannot
    be read leaves a short note above the row instead.
  - Only the camera asks for permission. The iOS library picker runs out of process and needs no
    photo-library access, so a library pick never prompts and works for a user who refused access.
  - On a device without a camera (the simulator), Take photo never launches the camera; it leaves the
    unavailable note. The check is `expo-device`'s `isDevice`.
  - A picked photo is scaled to 1024px on its long side and encoded once as JPEG
    (`photo-encoding.service.ts`, `expo-image-manipulator`). The estimate reads it at low detail, a
    512px rendition, so a full-size upload would only be slower. Once sent, the conversation keeps only
    the photo's uri for its bubble, not the encoded bytes.

## External constraints

- **`expo-image-picker`, `expo-image-manipulator` and `expo-device` are native modules.** Adding or
  upgrading any of them needs a new development build. The picker's `app.json` plugin entry sets the
  camera permission text and turns off the microphone permission. It keeps a photo-library text too,
  although no library pick asks: omitting it only brings back Expo's default string, and `false` would
  remove a purpose string the picker's binary still references.
- **Launching the camera where there is none aborts the app natively.** `UIImagePickerController`
  throws on the camera source, and no JS catch can stop it. That is why the `isDevice` check runs
  before every camera launch (`photo-picker.service.ts`).
- **Message text and the field are Manrope Regular 400,** as the frame sets them. The font is the Google
  Fonts static `Manrope-Regular.ttf`, v4.504, the same source as the Medium, SemiBold and Bold files.
- **Photo copies live in the app's cache.** `expo-image-picker` writes each pick to
  `Library/Caches/ImagePicker`, and `expo-image-manipulator` writes the scaled copy to the cache too.
  The app keeps no copy of its own and deletes neither. iOS clears them when it purges caches. The chat
  is gone once the screen closes.

## Undrawn states

Frame `9:3192` does not draw these, so they are built from existing tokens:

- the pending spinner;
- the error lines;
- the dimmed **Added** pill;
- the failed-add line;
- send keeping its light look while disabled;
- the attached-photo preview, with its remove button;
- the picker note;
- the over-limit line;
- the ChatGPT account row: the Continue with ChatGPT pill, its signing-in and signing-out states (disabled, "Signing
  in…" / "Signing out…") and note, and the signed-in line.

## Deviations from the frame, on purpose

- **The input row sits above the home indicator,** 8pt higher than the frame. With the keyboard up it
  sits 8pt above the keyboard, the spacing scale's step 2.
- **The row has 16pt padding on both sides.** The frame has 19pt on the left and 16pt on the right.
- **The field is 48pt tall,** like the buttons. The frame draws it at 47pt.
- **A text bubble above a photo hugs its text.** The frame stretches it to its fixed 257pt column.

## Constraints

- **Keyboard:** `KeyboardAvoidingView` handles it. The project has no screen-layout primitive and no
  `react-native-keyboard-controller`, which `RN-010` and `RN-011` ask for. Adopting them is a separate
  change.
- **The header overlays the chat.** Its measured height pads the top of the list.
