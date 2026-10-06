import { dateName, MAX_KCAL } from '@/features/tracking';

import type { ChatErrorKind } from '../types/track-chat.types';
import type { PhotoPick, PhotoSource } from './photo-picker.service';

// Every line the chat itself says, in one place. The model's own sentences are not here.
const ERROR_COPY: Record<ChatErrorKind, string> = {
  'missing-auth': 'Sign in with ChatGPT to get calorie estimates.',
  network: "I couldn't reach the estimate service. Check your connection and try again.",
  api: 'The estimate service returned an error. Please try again in a moment.',
  'usage-limit': "You've reached your ChatGPT usage limit. You can review it in ChatGPT settings.",
  'plan-unavailable': "Your ChatGPT plan can't be used for estimates here. You can check your plan in ChatGPT settings.",
  'invalid-response': "I couldn't read that estimate. Please try again.",
  unexpected: 'Something went wrong. Please try again.',
};

export const errorCopy = (kind: ChatErrorKind) => ERROR_COPY[kind];

/** The words a usage-limit or plan-unavailable line ends on, which open ChatGPT's usage settings (task 9, D4). */
export const USAGE_SETTINGS_LINK_COPY = 'ChatGPT settings';

/** Whether that line ends on the usage-settings link: OpenAI's errors-and-recovery page asks for one. */
export const linksToUsageSettings = (kind: ChatErrorKind) => kind === 'usage-limit' || kind === 'plan-unavailable';

interface ChatDay {
  dayKey: string;
  todayKey: string;
}

/** The day Add writes to, as the chat names it: 'today', or a past day's date ('Friday 2 October'). */
export const dayName = ({ dayKey, todayKey }: ChatDay) =>
  dayKey === todayKey ? 'today' : dateName(dayKey);

export const addFailedCopy = (day: string) => `Couldn't add it to ${day}. Please try again.`;

export const OVER_LIMIT_COPY = `That is over the ${MAX_KCAL.toLocaleString('en-US')} kcal limit for one entry, so it can't be added.`;

/** The estimate figure as the frame draws it: '+200'. */
export const estimateFigure = (kcal: number) => `+${kcal}`;

const CAMERA_DENIED_COPY = 'Camera access is off. Turn it on in Settings to take a photo.';

const PICK_FAILED_COPY: Record<PhotoSource, string> = {
  camera: "The camera isn't available right now.",
  library: "Couldn't open that photo. Please try again.",
};

type UnsuccessfulPick = Extract<PhotoPick, { status: 'denied' | 'failed' }>;

/** The short note a pick that went wrong leaves above the input row. */
export const pickNote = (pick: UnsuccessfulPick): string =>
  pick.status === 'denied' ? CAMERA_DENIED_COPY : PICK_FAILED_COPY[pick.source];
