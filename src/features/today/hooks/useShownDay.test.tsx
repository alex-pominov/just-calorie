import { act, renderHook } from '@testing-library/react-native';

import { useShownDay } from './useShownDay';

describe('useShownDay', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 4, 23, 59, 30) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const crossMidnight = () => act(() => jest.advanceTimersByTime(30_000));

  it('follows today across midnight while today is shown', async () => {
    const { result } = await renderHook(() => useShownDay());

    await crossMidnight();

    expect(result.current.shown).toEqual({ dayKey: '2026-10-05', todayKey: '2026-10-05' });
  });

  it('keeps a picked past day shown across midnight', async () => {
    const { result } = await renderHook(() => useShownDay());
    await act(() => result.current.showPrevious());

    await crossMidnight();

    expect(result.current.shown).toEqual({ dayKey: '2026-10-03', todayKey: '2026-10-05' });
  });

  it('never shows a day after today, however it is asked for', async () => {
    const { result } = await renderHook(() => useShownDay());

    await act(() => result.current.showNext());
    await act(() => result.current.select('2027-01-01'));

    expect(result.current.shown.dayKey).toBe('2026-10-04');
  });

  it('stops a year back, at the earliest day that can be logged', async () => {
    const { result } = await renderHook(() => useShownDay());
    await act(() => result.current.select('2025-10-04'));

    await act(() => result.current.showPrevious());
    await act(() => result.current.select('1900-01-01'));

    expect(result.current.shown.dayKey).toBe('2025-10-04');
  });
});
