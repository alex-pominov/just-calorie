import { fireEvent, render, screen } from '@testing-library/react-native';
import { findNodeHandle, Pressable, Text } from 'react-native';

import { EditCapFigure, EditCapLabel } from './EditCapLabel';

const classesOf = (element: { props: { className?: unknown } }) => String(element.props.className).split(' ');

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text];

describe('EditCapLabel', () => {
  // The label's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(
      <EditCapLabel onPress={jest.fn()}>
        <EditCapFigure>1200</EditCapFigure> from 1200 kcal left
      </EditCapLabel>,
    );
    await screen.unmount();
  });

  it('is a button named by its whole sentence that reports a press', async () => {
    const onPress = jest.fn();
    await render(
      <EditCapLabel onPress={onPress}>
        <EditCapFigure>1200</EditCapFigure> from 1200 kcal left
      </EditCapLabel>,
    );

    await fireEvent.press(screen.getByRole('button', { name: '1200 from 1200 kcal left' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sets the figure in bold primary and the rest of the sentence in the muted medium body style', async () => {
    await render(
      <EditCapLabel>
        <EditCapFigure>1200</EditCapFigure> from 1200 kcal left
      </EditCapLabel>,
    );

    const figure = screen.getByText('1200', { exact: true });
    const sentence = figure.parent;

    expect(classesOf(figure)).toEqual(expect.arrayContaining(['font-manrope-bold', 'text-primary']));
    expect(classesOf(figure)).not.toContain('text-content-muted');
    expect(classesOf(sentence ?? figure)).toEqual(
      expect.arrayContaining(['font-manrope-medium', 'text-body', 'text-content-muted']),
    );
  });
});
