import type { EstimateErrorKind } from '@/modules/calorie-estimate';

/** A photo waiting to be sent, already scaled down: `uri` draws it, `base64` and `mimeType` go to the estimate. */
export type ChatPhoto = {
  readonly uri: string;
  readonly base64: string;
  readonly mimeType: string;
};

/** A photo once sent: the bubble only draws it, so the encoded bytes are not kept. */
export type SentPhoto = {
  readonly uri: string;
};

/** What the input row hands over on send. At least one of the two is present. */
export type ChatDraft = {
  readonly text: string;
  readonly photo: ChatPhoto | null;
};

export type UserMessage = {
  readonly id: string;
  readonly role: 'user';
  readonly text: string | null;
  readonly photo: SentPhoto | null;
};

/** 'unexpected' is anything the estimate module did not throw as an EstimateError. */
export type ChatErrorKind = EstimateErrorKind | 'unexpected';

/** Where an estimate's Add stands: once 'added', it can never be added again. */
export type AddState = 'idle' | 'adding' | 'added' | 'failed';

export type AiMessage =
  | { readonly id: string; readonly role: 'ai'; readonly status: 'pending' }
  | {
      readonly id: string;
      readonly role: 'ai';
      readonly status: 'reply';
      readonly reply: string;
      readonly kcal: number | null;
      readonly addState: AddState;
    }
  | { readonly id: string; readonly role: 'ai'; readonly status: 'error'; readonly error: ChatErrorKind };

export type ChatMessage = UserMessage | AiMessage;
