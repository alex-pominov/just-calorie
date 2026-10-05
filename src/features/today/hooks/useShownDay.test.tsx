import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { useShownDay } from './useShownDay';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
}));

// A haptic plays a task later than the step that asked for it; the clock here is fake.
const settle = () => act(() => jest.advanceTimersByTimeAsync(0));

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

  it('ticks a selection haptic for each step that changes the day, and none at either edge or on a pick', async () => {
    const { result } = await renderHook(() => useShownDay());

    await act(() => result.current.showNext());
    await act(() => result.current.showPrevious());
    await act(() => result.current.select('2025-10-04'));
    await act(() => result.current.showPrevious());
    await act(() => result.current.showNext());
    await settle();

    expect(result.current.shown.dayKey).toBe('2025-10-05');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('steps from the latest shown day when two swipes end before a re-render, ticking once per real change (qa f-714067)', async () => {
    const { result } = await renderHook(() => useShownDay());

    await act(() => {
      const atEnd = result.current;

      atEnd.showPrevious();
      atEnd.showPrevious();
    });
    await settle();

    expect(result.current.shown.dayKey).toBe('2026-10-02');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('ticks once when two swipes past today end before a re-render, after one step back', async () => {
    const { result } = await renderHook(() => useShownDay());
    await act(() => result.current.showPrevious());

    await act(() => {
      const atEnd = result.current;

      atEnd.showNext();
      atEnd.showNext();
    });
    await settle();

    expect(result.current.shown.dayKey).toBe('2026-10-04');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  it('stops a year back, at the earliest day that can be logged', async () => {
    const { result } = await renderHook(() => useShownDay());
    await act(() => result.current.select('2025-10-04'));

    await act(() => result.current.showPrevious());
    await act(() => result.current.select('1900-01-01'));

    expect(result.current.shown.dayKey).toBe('2025-10-04');
  });
});
