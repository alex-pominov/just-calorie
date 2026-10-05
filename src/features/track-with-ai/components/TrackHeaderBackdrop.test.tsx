import { render, screen } from '@testing-library/react-native';
import { findNodeHandle, StyleSheet, View } from 'react-native';

import { TrackHeaderBackdrop } from './TrackHeaderBackdrop';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, StyleSheet, View];

describe('TrackHeaderBackdrop', () => {
  // The backdrop's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(<TrackHeaderBackdrop />);
    await screen.unmount();
  });

  it("is frame 9:3378's fade alone, with no blur under it", async () => {
    await render(<TrackHeaderBackdrop />);

    expect(JSON.stringify(screen.toJSON())).not.toMatch(/blur/i);
    expect(StyleSheet.flatten(screen.getByTestId('track-header-fade').props.style)).toMatchObject({
      experimental_backgroundImage: [expect.objectContaining({ type: 'linear-gradient', direction: 'to bottom' })],
    });
  });
});
