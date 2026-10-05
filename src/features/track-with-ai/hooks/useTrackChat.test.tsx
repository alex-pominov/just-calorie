import { act, renderHook } from '@testing-library/react-native';

import { estimateCalories } from '@/modules/calorie-estimate';

import { useTrackChat } from './useTrackChat';

jest.mock('@/modules/calorie-estimate', () => ({
  ...jest.requireActual('@/modules/calorie-estimate'),
  estimateCalories: jest.fn(),
}));

jest.mock('@/features/tracking', () => ({
  ...jest.requireActual('@/features/tracking'),
  useAddEntry: () => jest.fn(),
  useTodayKey: () => '2026-10-04',
}));

const mockEstimate = jest.mocked(estimateCalories);
const photo = { uri: 'file:///scaled.jpg', base64: 'U0NBTEVE', mimeType: 'image/jpeg' };

describe('useTrackChat', () => {
  it('sends the photo bytes but keeps only its uri in the conversation', async () => {
    mockEstimate.mockResolvedValue({ reply: 'Pasta.', kcal: 600 });
    const { result } = await renderHook(() => useTrackChat('2026-10-04'));

    await act(() => result.current.send({ text: 'lunch', photo }));

    expect(mockEstimate).toHaveBeenCalledWith(
      { text: 'lunch', photo: { base64: 'U0NBTEVE', mimeType: 'image/jpeg' } },
      { signal: expect.any(Object) },
    );
    expect(result.current.messages[0]).toEqual({ id: expect.any(String), role: 'user', text: 'lunch', photo: { uri: 'file:///scaled.jpg' } });
    expect(JSON.stringify(result.current.messages)).not.toContain('U0NBTEVE');
  });

  it('aborts a reply still in flight when the screen goes away, and records no failure for it', async () => {
    const seen: { signal: AbortSignal | null } = { signal: null };
    mockEstimate.mockImplementation(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          seen.signal = options?.signal ?? null;
          options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const { result, unmount } = await renderHook(() => useTrackChat('2026-10-04'));
    let sending: Promise<void> = Promise.resolve();

    await act(async () => {
      sending = result.current.send({ text: 'toast', photo: null });
    });
    expect(seen.signal?.aborted).toBe(false);

    await unmount();
    await sending;

    expect(seen.signal?.aborted).toBe(true);
    expect(result.current.messages.map((message) => (message.role === 'ai' ? message.status : 'user'))).toEqual(['user', 'pending']);
  });
});
