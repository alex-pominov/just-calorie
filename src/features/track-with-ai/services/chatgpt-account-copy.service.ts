import type { ChatGPTAuthErrorKind } from '@/modules/chatgpt-auth';

// Every line Track with AI says about the ChatGPT sign-in, in one place: Figma 24:4273 (signed out) and 24:4327
// (signed in), and the Lead's decisions for what the frames do not show (task 9, D1-D5).
export const SIGN_IN_PROMPT_COPY = 'To activate AI features';

export const SIGN_IN_WITH_CHATGPT_COPY = 'Sign In with ChatGPT';

export const USE_ANOTHER_ACCOUNT_COPY = 'Use a different ChatGPT account';

export const SIGN_OUT_FROM_GPT_COPY = 'Sign Out from GPT';

export const SIGNING_IN_COPY = 'Signing in…';

export const SIGNING_OUT_COPY = 'Signing out…';

const SIGN_IN_FAILED_COPY: Record<ChatGPTAuthErrorKind, string> = {
  unavailable: "Sign in with ChatGPT isn't available in this build of the app.",
  denied: 'ChatGPT sign-in was declined.',
  'plan-not-allowed': "Just Calorie wasn't allowed to use your ChatGPT plan, so it can't estimate with it.",
  'another-account': "That isn't the ChatGPT account saved on this phone. To add it, tap Use a different ChatGPT account.",
  network: "Couldn't reach ChatGPT. Check your connection and try again.",
  failed: "ChatGPT sign-in didn't finish. Please try again.",
};

export const signInFailedCopy = (kind: ChatGPTAuthErrorKind) => SIGN_IN_FAILED_COPY[kind];

export const SIGN_OUT_UNCONFIRMED_COPY =
  "Signed out on this phone. ChatGPT didn't confirm it, so you can also disconnect Just Calorie in ChatGPT settings.";

export const SIGN_OUT_FAILED_COPY = "Couldn't sign out. Please try again.";

export const USAGE_UNAVAILABLE_COPY = "Couldn't open ChatGPT settings. Please try again.";
