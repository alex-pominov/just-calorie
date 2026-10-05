import type { ChatGPTAuthErrorKind } from './chatgpt-auth.types';

// Fixed text only. Nothing from a token, a token response or the authorization callback reaches a message.
const MESSAGES: Record<ChatGPTAuthErrorKind, string> = {
  unavailable: 'This build cannot run Sign in with ChatGPT',
  denied: 'ChatGPT sign-in was declined',
  'plan-not-allowed': 'The ChatGPT sign-in did not allow using the ChatGPT plan',
  'another-account': 'Another ChatGPT account answered the saved account’s sign-in',
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
