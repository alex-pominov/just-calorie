import { useState } from 'react';

import { pickNote } from '../services/chat-copy.service';
import { encodePhoto } from '../services/photo-encoding.service';
import { pickPhoto } from '../services/photo-picker.service';
import { choosePhotoSource } from '../services/photo-source.service';
import type { ChatPhoto } from '../types/track-chat.types';

export type PhotoDraft = {
  readonly photo: ChatPhoto | null;
  readonly note: string | null;
  readonly attach: () => Promise<void>;
  readonly remove: () => void;
  readonly clear: () => void;
};

/** The photo waiting to be sent with the next message, and the note a failed pick leaves behind. */
export function usePhotoDraft(): PhotoDraft {
  const [photo, setPhoto] = useState<ChatPhoto | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const attach = async () => {
    const source = await choosePhotoSource();

    if (source === null) return;

    const pick = await pickPhoto(source);

    if (pick.status === 'canceled') return;

    if (pick.status !== 'picked') {
      setNote(pickNote(pick));

      return;
    }

    try {
      setPhoto(await encodePhoto(pick.image));
      setNote(null);
    } catch {
      // A photo that cannot be scaled or encoded is a failed pick: the note says so, nothing is attached.
      setNote(pickNote({ status: 'failed', source }));
    }
  };

  const clear = () => {
    setPhoto(null);
    setNote(null);
  };

  return { photo, note, attach, remove: () => setPhoto(null), clear };
}
