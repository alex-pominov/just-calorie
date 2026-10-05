import { act, renderHook } from '@testing-library/react-native';

import { useTodayKey } from './useTodayKey';

describe('useTodayKey', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 6, 15, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves to the next day key at each local midnight', async () => {
    const { result } = await renderHook(() => useTodayKey());

    expect(result.current).toBe('2026-07-15');

    await act(() => jest.advanceTimersByTime(30_000));

    expect(result.current).toBe('2026-07-16');

    await act(() => jest.advanceTimersByTime(24 * 60 * 60 * 1000));

    expect(result.current).toBe('2026-07-17');
  });
});
