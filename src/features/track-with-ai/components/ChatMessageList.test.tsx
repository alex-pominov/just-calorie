import { ActivityIndicator, FlatList, I18nManager, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ChatMessage } from '../types/track-chat.types';
import { ChatMessageList } from './ChatMessageList';

const messages: readonly ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'toast', photo: null },
  { id: 'a1', role: 'ai', status: 'reply', reply: 'Toast.', kcal: 90, addState: 'idle' },
];

const layout = (height: number, width = 402) => ({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which
// no timeout covers. Under host load, that cold load plus the first render outlasted the 5 s test budget (f-a1ad38).
// FlatList reads I18nManager on its first layout, so it is touched here too.
const PRELOADED = [ActivityIndicator, FlatList, I18nManager, Image, Pressable, ScrollView, Text, View];

describe('ChatMessageList', () => {
  // The tree's first render, with its modules already loaded, so the timed test below starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    const warm = await render(<ChatMessageList messages={messages} dayName="today" headerHeight={134} onAdd={jest.fn()} onOpenUsageSettings={jest.fn()} />);
    await warm.unmount();
  });

  it('keeps the newest message in view from the measured content and viewport, whichever changes', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    await render(<ChatMessageList messages={messages} dayName="today" headerHeight={134} onAdd={jest.fn()} onOpenUsageSettings={jest.fn()} />);
    const list = screen.getByTestId('chat-messages');

    await fireEvent(list, 'layout', layout(784));
    await fireEvent(list, 'contentSizeChange', 402, 624);
    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: true });

    // The keyboard opens: the viewport shrinks and the end must stay in view.
    await fireEvent(list, 'layout', layout(475));
    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 149, animated: true });

    // A reply grows the content while the keyboard is up.
    await fireEvent(list, 'contentSizeChange', 402, 700);
    expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 225, animated: true });
  });
});
