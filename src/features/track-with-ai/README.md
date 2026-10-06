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
  From `@/modules/chatgpt-auth` it uses the session status, whether an account is saved, sign-in, sign-out and the
  usage-settings link.

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
  | nobody signed in | Sign in with ChatGPT to get calorie estimates. |
  | no network or a timeout | I couldn't reach the estimate service. Check your connection and try again. |
  | API error | The estimate service returned an error. Please try again in a moment. |
  | ChatGPT usage limit | You've reached your ChatGPT usage limit. You can review it in ChatGPT settings. |
  | ChatGPT plan not usable here (a 403, such as a Free account) | Your ChatGPT plan can't be used for estimates here. You can check your plan in ChatGPT settings. |
  | unreadable response | I couldn't read that estimate. Please try again. |

  A failure that is not an `EstimateError` gets a generic line.
- **Sign in with ChatGPT** decides which of two states the screen shows, under the same header (copy in
  `chatgpt-account-copy.service.ts`; the Lead's decisions D1-D6 for what the frames do not draw, task 9, approved as
  request [3]):
  - **Signed out (Figma `24:4273`)**: only a centred line, **To activate AI features**, over a white
    **Sign In with ChatGPT** pill (`ChatGPTSignInPrompt`). There is no chat and no input row. The pill opens OpenAI's
    sign-in for the account used last on this phone, with the client it registered, and reads **Signing in…**,
    disabled, until it ends (D1).
  - On a phone where an account has signed in before, a text link under the pill, **Use a different ChatGPT
    account**, registers another account with its own client (D2; OpenAI's sign-in docs, §1: "let them choose a saved
    ChatGPT account or add another account"). A fresh install shows exactly the frame, with no link.
  - A cancelled sign-in says nothing. Any other ending leaves one line under the pill naming why (D3).
  - **Signed in (Figma `24:4327`)**: the chat and its input row, with **Sign Out from GPT** centred 16pt above the
    row, on the input section's top edge and not part of it (`SignedInChat`, `ChatGPTSignOutLink`; owner's intake-9,
    backlog 19). The empty chat draws nothing else: the frame dropped its **What have I eaten today?** prompt on
    2026-10-05. The input section pads the row 16pt above and 24pt below, as the frame draws it: the row ends inside
    the 34pt home-indicator inset, where it used to be held above it (backlog 19 asks for the frame within 1pt). The
    keyboard covers the link rather than lifting it with the row, so it shows only while the keyboard is down
    (`useKeyboardShown`, on the same keyboardWillShow and keyboardWillHide that move the row; a hardware keyboard's
    shortcut bar hides it too). The account's line under it stays up with the keyboard (qa f-ae4ff0). An attached
    photo or a picker note sits between the link and the row. Sign Out from GPT reads **Signing out…**, disabled,
    until the sign-out ends (D5). A sign-out that failed leaves the user signed in, with one line under the link (D3).
    One that OpenAI did not confirm still signs this phone out, so its line, which points at ChatGPT settings to
    disconnect the app, shows under the pill on the signed-out view (qa f-49b773).
  - **Leaving signed-in discards the chat** (qa f-d56e21): the moment the session starts signing out, or ends on its
    own, the messages, the typed draft and an attached photo go, and a reply still in flight is aborted, since it was
    fetched with that session's token. The next sign-in, another account included, starts at the empty chat.
  - **ChatGPT settings** in the usage-limit and plan-unavailable lines is a link to ChatGPT's usage settings (D4),
    which open in the default browser, outside the app (backlog 17). If they cannot open, a line under Sign Out from GPT says so. There is no separate Manage usage control.
  - Neither state shows until the Keychain has been read, so the sign-in prompt never flashes for a signed-in user.
  - Every estimate runs on the signed-in user's ChatGPT plan; there is no other credential.
- **Add:**
  - It records exactly N kcal as an `add` entry on the day `/track` was opened for. Its label and its failure
    line name that day: "today", or a past day's date ("Friday 2 October").
  - On success the pill reads **Added** and is disabled, so one estimate is never added twice. A stored add also taps a
    light impact haptic (`modules/haptics`), and a failed one plays none.
  - If the write fails, a line under the card says so, and Add stays usable.
- **Track with AI is a full-screen page that slides up from the bottom** and back down when closed (owner's
  intake-8; `FULL_SCREEN_OPTIONS` in `src/config/navigation.ts`). iOS's full-screen presentation has no swipe to
  dismiss, so Close is the way out.
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
- the ChatGPT states' extras, which frames `24:4273` and `24:4327` do not draw: Signing in… and Signing out…, the
  Use a different ChatGPT account link, the outcome line, and the ChatGPT settings link inside an error line.

## Deviations from the frame, on purpose

- **The signed-out line reads "To activate AI features"**, where frame `24:4273` says "To active AI features": a
  copy fix the Manager made under the owner's delegation on 2026-10-05, which the owner may revert.
- **The field is 48pt tall,** like the buttons. The frame draws it at 47pt.
- **A text bubble above a photo hugs its text.** The frame stretches it to its fixed 257pt column.

## Constraints

- **Keyboard:** `KeyboardAvoidingView` handles it. The project has no screen-layout primitive and no
  `react-native-keyboard-controller`, which `RN-010` and `RN-011` ask for. Adopting them is a separate
  change.
- **The header overlays the chat.** Its measured height pads the top of the list.
