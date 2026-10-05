import type { CalorieEstimate } from '@/modules/calorie-estimate';
import { EstimateError } from '@/modules/calorie-estimate';
import { MAX_KCAL } from '@/features/tracking';

import type { AddState, AiMessage, ChatErrorKind, ChatMessage, UserMessage } from '../types/track-chat.types';

export type ChatAction =
  | { readonly type: 'sent'; readonly user: UserMessage; readonly replyId: string }
  | { readonly type: 'answered'; readonly replyId: string; readonly estimate: CalorieEstimate }
  | { readonly type: 'failed'; readonly replyId: string; readonly error: ChatErrorKind }
  | { readonly type: 'add-started' | 'add-succeeded' | 'add-failed'; readonly replyId: string };

const ADD_STATE_AFTER: Record<'add-started' | 'add-succeeded' | 'add-failed', AddState> = {
  'add-started': 'adding',
  'add-succeeded': 'added',
  'add-failed': 'failed',
};

function replaceReply(messages: readonly ChatMessage[], replyId: string, next: (message: AiMessage) => AiMessage) {
  return messages.map((message) => (message.role === 'ai' && message.id === replyId ? next(message) : message));
}

/** The conversation, oldest first. Each user message is followed by the one AI message that answers it. */
export function chatReducer(messages: readonly ChatMessage[], action: ChatAction): readonly ChatMessage[] {
  switch (action.type) {
    case 'sent':
      return [...messages, action.user, { id: action.replyId, role: 'ai', status: 'pending' }];
    case 'answered':
      return replaceReply(messages, action.replyId, ({ id }) => ({
        id,
        role: 'ai',
        status: 'reply',
        reply: action.estimate.reply,
        kcal: action.estimate.kcal,
        addState: 'idle',
      }));
    case 'failed':
      return replaceReply(messages, action.replyId, ({ id }) => ({ id, role: 'ai', status: 'error', error: action.error }));
    case 'add-started':
    case 'add-succeeded':
    case 'add-failed':
      return replaceReply(messages, action.replyId, (message) =>
        message.status === 'reply' ? { ...message, addState: ADD_STATE_AFTER[action.type] } : message,
      );
  }
}

/** True while a reply is outstanding: the next message waits for it. */
export const isAwaitingReply = (messages: readonly ChatMessage[]) =>
  messages.some((message) => message.role === 'ai' && message.status === 'pending');

/** True when an estimate is more than one entry may hold: the data layer would refuse it, so it is never offered. */
export const isOverEntryLimit = (kcal: number) => kcal > MAX_KCAL;

/** An estimate can be added while it has a kcal within one entry's limit and is not being, or already, added. */
export const canAdd = (message: AiMessage) =>
  message.status === 'reply' &&
  message.kcal !== null &&
  !isOverEntryLimit(message.kcal) &&
  (message.addState === 'idle' || message.addState === 'failed');

export const chatErrorKindOf = (error: unknown): ChatErrorKind =>
  error instanceof EstimateError ? error.kind : 'unexpected';
