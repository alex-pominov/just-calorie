import type { ChatGPTAuthErrorKind } from '@/modules/chatgpt-auth';

// Every line the ChatGPT account row says, in one place. OpenAI's UI guidelines name the button and the
// plan line: https://developers.openai.com/siwc/ui-ux-guidelines.
export const CONTINUE_WITH_CHATGPT_COPY = 'Continue with ChatGPT';

export const SIGNING_IN_COPY = 'Signing in…';

export const SIGNING_OUT_COPY = 'Signing out…';

export const USING_PLAN_COPY = 'Using ChatGPT plan';

export const MANAGE_USAGE_COPY = 'Manage usage';

export const SIGN_OUT_COPY = 'Sign out';

const SIGN_IN_FAILED_COPY: Record<ChatGPTAuthErrorKind, string> = {
  unavailable: "Sign in with ChatGPT isn't available in this version of the app yet.",
  denied: 'ChatGPT sign-in was declined.',
  'plan-not-allowed': "Just Calorie wasn't allowed to use your ChatGPT plan, so it can't estimate with it.",
  network: "Couldn't reach ChatGPT. Check your connection and try again.",
  failed: "ChatGPT sign-in didn't finish. Please try again.",
};

export const signInFailedCopy = (kind: ChatGPTAuthErrorKind) => SIGN_IN_FAILED_COPY[kind];

export const SIGN_OUT_UNCONFIRMED_COPY =
  "Signed out on this phone. ChatGPT didn't confirm it, so you can also disconnect Just Calorie in ChatGPT settings.";

export const SIGN_OUT_FAILED_COPY = "Couldn't sign out. Please try again.";

export const USAGE_UNAVAILABLE_COPY = "Couldn't open ChatGPT settings. Please try again.";
