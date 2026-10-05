import { act, renderHook } from '@testing-library/react-native';

import { useLoggableDayKey } from './useLoggableDayKey';

describe('useLoggableDayKey', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 4, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const crossMidnight = () => act(() => jest.advanceTimersByTime(30_000));

  it.each([
    ['the earliest day', '2025-10-04'],
    ['a past day', '2026-10-01'],
    ['today', '2026-10-04'],
  ])('keeps a pop-up opened for %s on that day across midnight', async (_label, param) => {
    const { result } = await renderHook(() => useLoggableDayKey(param));

    await crossMidnight();

    expect(result.current).toBe(param);
  });

  it('keeps a pop-up opened with no day on the day it opened', async () => {
    const { result } = await renderHook(() => useLoggableDayKey(undefined));

    await crossMidnight();

    expect(result.current).toBe('2026-10-04');
  });

  it('follows a new day parameter given to an open pop-up', async () => {
    const { result, rerender } = await renderHook(({ day }: { day: string }) => useLoggableDayKey(day), {
      initialProps: { day: '2026-10-01' },
    });

    await rerender({ day: '2026-10-02' });

    expect(result.current).toBe('2026-10-02');
  });
});
