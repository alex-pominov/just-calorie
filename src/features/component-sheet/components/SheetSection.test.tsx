import { findNodeHandle, Text, View } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { SheetSection } from './SheetSection';

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the timed test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Text, View];

describe('SheetSection', () => {
  // The section's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(
      <SheetSection caption="Tab — Add">
        <Text>variant</Text>
      </SheetSection>,
    );
    await screen.unmount();
  });

  it('shows its caption above the variant it names', async () => {
    await render(
      <SheetSection caption="Tab — Add">
        <Text>variant</Text>
      </SheetSection>,
    );

    expect(screen.getByText('Tab — Add')).toBeOnTheScreen();
    expect(screen.getByText('variant')).toBeOnTheScreen();
  });
});
