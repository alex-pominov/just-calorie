import type { ChatGPTAuthErrorKind } from './chatgpt-auth.types';

// Fixed text only. Nothing from a token, a token response or the authorization callback reaches a message.
const MESSAGES: Record<ChatGPTAuthErrorKind, string> = {
  unavailable: 'Sign in with ChatGPT is not configured in this build',
  denied: 'ChatGPT sign-in was declined',
  'plan-not-allowed': 'The ChatGPT sign-in did not allow using the ChatGPT plan',
  network: 'ChatGPT sign-in did not get a response',
  failed: 'ChatGPT sign-in could not be completed',
};

/** The one failure the sign-in functions throw. The UI switches on `kind`. */
export class ChatGPTAuthError extends Error {
  override readonly name = 'ChatGPTAuthError';
  readonly kind: ChatGPTAuthErrorKind;

  constructor(kind: ChatGPTAuthErrorKind, options: { readonly cause?: unknown } = {}) {
    super(MESSAGES[kind], { cause: options.cause });
    this.kind = kind;
  }
}
