import { useEffect, useReducer, useRef } from 'react';

import { estimateCalories } from '@/modules/calorie-estimate';
import { useAddEntry } from '@/features/tracking';

import { canAdd, chatErrorKindOf, chatReducer, isAwaitingReply } from '../services/track-chat.service';
import type { AiMessage, ChatDraft, ChatMessage } from '../types/track-chat.types';

export type TrackChat = {
  readonly messages: readonly ChatMessage[];
  readonly isAwaitingReply: boolean;
  readonly send: (draft: ChatDraft) => Promise<void>;
  readonly add: (message: AiMessage) => Promise<void>;
};

const hasContent = (draft: ChatDraft) => draft.text.trim() !== '' || draft.photo !== null;

/**
 * The conversation while /track is open. It lives in memory only and starts empty each time (the owner's
 * ruling on request [1]); what Add records persists, on the day /track was opened for, through the tracking feature.
 */
export function useTrackChat(dayKey: string): TrackChat {
  const [messages, dispatch] = useReducer(chatReducer, []);
  const addEntry = useAddEntry();
  const nextId = useRef(0);
  // A second tap can land before the re-render that disables its button; these refuse it.
  const sending = useRef(false);
  const adding = useRef(new Set<string>());
  // Leaving the screen aborts a reply nobody will read, so it is not billed in full.
  const inFlight = useRef(new Set<AbortController>());

  useEffect(() => {
    const controllers = inFlight.current;

    return () => controllers.forEach((controller) => controller.abort());
  }, []);

  const newId = () => `message-${(nextId.current += 1)}`;

  const send = async (draft: ChatDraft) => {
    if (sending.current || !hasContent(draft)) return;

    sending.current = true;
    const controller = new AbortController();
    inFlight.current.add(controller);
    const text = draft.text.trim();
    const replyId = newId();
    const photo = draft.photo === null ? null : { uri: draft.photo.uri };
    dispatch({ type: 'sent', user: { id: newId(), role: 'user', text: text === '' ? null : text, photo }, replyId });

    try {
      const request =
        draft.photo === null ? { text } : { text, photo: { base64: draft.photo.base64, mimeType: draft.photo.mimeType } };
      const estimate = await estimateCalories(request, { signal: controller.signal });
      dispatch({ type: 'answered', replyId, estimate });
    } catch (error) {
      // An abort is the screen closing: there is no chat left to tell. Anything else becomes a message.
      if (controller.signal.aborted) return;
      dispatch({ type: 'failed', replyId, error: chatErrorKindOf(error) });
    } finally {
      inFlight.current.delete(controller);
      sending.current = false;
    }
  };

  const add = async (message: AiMessage) => {
    if (!canAdd(message) || message.status !== 'reply' || message.kcal === null || adding.current.has(message.id)) return;

    adding.current.add(message.id);
    dispatch({ type: 'add-started', replyId: message.id });

    try {
      await addEntry({ dayKey, kind: 'add', kcal: message.kcal });
      dispatch({ type: 'add-succeeded', replyId: message.id });
    } catch {
      dispatch({ type: 'add-failed', replyId: message.id });
    } finally {
      adding.current.delete(message.id);
    }
  };

  return { messages, isAwaitingReply: isAwaitingReply(messages), send, add };
}
