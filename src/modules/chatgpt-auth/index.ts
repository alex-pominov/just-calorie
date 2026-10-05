import type { SignInOutcome, SignOutOutcome } from './chatgpt-auth.types';
import { chatGPTSession } from './chatgpt-session';

export { ChatGPTAuthError } from './chatgpt-auth-error';
export { openChatGPTUsageSettings } from './chatgpt-session';
export { useChatGPTSessionStatus } from './useChatGPTSessionStatus';
export type { ChatGPTAuthErrorKind, ChatGPTSessionStatus, SignInOutcome, SignOutOutcome } from './chatgpt-auth.types';

/** Opens OpenAI's sign-in. Resolves 'cancelled' when the user backs out; throws `ChatGPTAuthError` otherwise. */
export const signInWithChatGPT = (): Promise<SignInOutcome> => chatGPTSession.signIn();

/** Revokes the session at OpenAI and deletes its tokens from the Keychain. */
export const signOutOfChatGPT = (): Promise<SignOutOutcome> => chatGPTSession.signOut();

/** The signed-in user's access token, refreshed when near expiry; null when nobody is signed in on this device. */
export const getChatGPTAccessToken = (): Promise<string | null> => chatGPTSession.getAccessToken();

/** OpenAI refused this access token: the next `getChatGPTAccessToken` refreshes it first. */
export const rejectChatGPTAccessToken = (token: string): void => chatGPTSession.rejectAccessToken(token);
