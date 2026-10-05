import * as Haptics from 'expo-haptics';

import { playLightImpactHaptic, playSelectionHaptic } from './haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('haptics', () => {
  it('plays the selection tick', async () => {
    playSelectionHaptic();
    await flush();

    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('plays a light impact', async () => {
    playLightImpactHaptic();
    await flush();

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it.each([
    ['rejects', () => Promise.reject(new Error('unavailable'))],
    ['throws', () => {
      throw new Error('no native module');
    }],
  ])('never passes on a haptic that %s', async (_case, failing) => {
    jest.mocked(Haptics.selectionAsync).mockImplementationOnce(failing);
    jest.mocked(Haptics.impactAsync).mockImplementationOnce(failing);

    expect(() => {
      playSelectionHaptic();
      playLightImpactHaptic();
    }).not.toThrow();
    await flush();
  });
});
