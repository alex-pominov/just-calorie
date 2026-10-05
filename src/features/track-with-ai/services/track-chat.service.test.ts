import { EstimateError } from '@/modules/calorie-estimate';

import type { AiMessage, ChatMessage } from '../types/track-chat.types';
import { canAdd, chatErrorKindOf, chatReducer, isAwaitingReply, isOverEntryLimit } from './track-chat.service';

const user = { id: 'u1', role: 'user', text: 'toast', photo: null } as const;
const sent = chatReducer([], { type: 'sent', user, replyId: 'a1' });
const answered = (kcal: number | null) => chatReducer(sent, { type: 'answered', replyId: 'a1', estimate: { reply: 'Toast.', kcal } });
const reply = (messages: readonly ChatMessage[]): AiMessage => {
  const message = messages[1];
  if (message?.role !== 'ai') throw new Error('expected the AI message second');

  return message;
};

describe('chatReducer', () => {
  it('appends the user message and a pending reply, then answers that reply in place', () => {
    expect(sent).toEqual([user, { id: 'a1', role: 'ai', status: 'pending' }]);
    expect(isAwaitingReply(sent)).toBe(true);

    expect(reply(answered(90))).toEqual({ id: 'a1', role: 'ai', status: 'reply', reply: 'Toast.', kcal: 90, addState: 'idle' });
    expect(isAwaitingReply(answered(90))).toBe(false);
  });

  it('turns a failed reply into an error message', () => {
    expect(reply(chatReducer(sent, { type: 'failed', replyId: 'a1', error: 'network' }))).toEqual({
      id: 'a1',
      role: 'ai',
      status: 'error',
      error: 'network',
    });
  });

  it('walks Add through adding to added, and back to usable on a failure', () => {
    const adding = chatReducer(answered(90), { type: 'add-started', replyId: 'a1' });
    expect(reply(adding)).toMatchObject({ addState: 'adding' });
    expect(canAdd(reply(adding))).toBe(false);

    expect(reply(chatReducer(adding, { type: 'add-succeeded', replyId: 'a1' }))).toMatchObject({ addState: 'added' });
    expect(canAdd(reply(chatReducer(adding, { type: 'add-succeeded', replyId: 'a1' })))).toBe(false);

    const failed = chatReducer(adding, { type: 'add-failed', replyId: 'a1' });
    expect(reply(failed)).toMatchObject({ addState: 'failed' });
    expect(canAdd(reply(failed))).toBe(true);
  });

  it('never makes a reply without a kcal, or one still pending, addable', () => {
    expect(canAdd(reply(answered(null)))).toBe(false);
    expect(canAdd(reply(sent))).toBe(false);
    expect(chatReducer(sent, { type: 'add-started', replyId: 'a1' })).toEqual(sent);
  });

  it('never makes an estimate above one entry\'s 10,000 kcal limit addable', () => {
    expect(isOverEntryLimit(10_000)).toBe(false);
    expect(isOverEntryLimit(10_001)).toBe(true);
    expect(canAdd(reply(answered(10_000)))).toBe(true);
    expect(canAdd(reply(answered(10_001)))).toBe(false);
  });

  it("reads an EstimateError's kind and anything else as 'unexpected'", () => {
    expect(chatErrorKindOf(new EstimateError('api', { status: 500 }))).toBe('api');
    expect(chatErrorKindOf(new Error('boom'))).toBe('unexpected');
  });
});
