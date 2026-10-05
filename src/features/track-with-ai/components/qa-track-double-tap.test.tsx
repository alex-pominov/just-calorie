import type * as ChatGPTAuthMock from '@tests/chatgpt-auth.mock';
import {
  ActivityIndicator,
  findNodeHandle,
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { estimateCalories } from '@/modules/calorie-estimate';

import { TrackWithAiScreen } from './TrackWithAiScreen';

// QA reproduction (track-with-ai, round 1a): a second tap that lands before the re-render which
// disables its button. Both taps run inside ONE act, so React commits nothing between them.
// The chat shows only when signed in (Figma 24:4327); these tests drive the chat.
jest.mock('@/modules/chatgpt-auth', () => jest.requireActual<typeof ChatGPTAuthMock>('@tests/chatgpt-auth.mock').chatGPTAuthMock);

jest.mock('@/modules/calorie-estimate', () => ({
  ...jest.requireActual('@/modules/calorie-estimate'),
  estimateCalories: jest.fn(),
}));

const mockAddEntry = jest.fn();

// Adopted by the app lane: the real index is spread in, so MAX_KCAL keeps its one source.
jest.mock('@/features/tracking', () => ({
  ...jest.requireActual('@/features/tracking'),
  useAddEntry: () => mockAddEntry,
  useTodayKey: () => '2026-10-04',
}));

const mockEstimate = jest.mocked(estimateCalories);
const routes = { index: () => <Text>main screen</Text>, track: () => <TrackWithAiScreen dayKey="2026-10-04" /> };

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
// FlatList reads ScrollView and I18nManager as it first renders, so they are touched here too.
const PRELOADED = [
  ActivityIndicator,
  findNodeHandle,
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
];

describe('qa: a double tap counts once', () => {
  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderRouter(routes, { initialUrl: '/track' });
    await screen.unmount();
    // renderRouter switched to fake timers; the tests start on real ones, as they did before this warm-up.
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockEstimate.mockResolvedValue({ reply: 'Two eggs, about 150 kcal.', kcal: 150 });
    mockAddEntry.mockResolvedValue(undefined);
  });

  it('records one entry for two Add taps in one frame', async () => {
    await renderRouter(routes, { initialUrl: '/track' });
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'two eggs');
    await fireEvent.press(screen.getByTestId('chat-send'));
    const add = await screen.findByRole('button', { name: 'Add 150 kcal to today' });

    await act(async () => {
      fireEvent.press(add);
      fireEvent.press(add);
    });

    expect(mockAddEntry).toHaveBeenCalledTimes(1);
  });

  it('sends one request for two Send taps in one frame', async () => {
    await renderRouter(routes, { initialUrl: '/track' });
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'two eggs');
    const send = screen.getByTestId('chat-send');

    await act(async () => {
      fireEvent.press(send);
      fireEvent.press(send);
    });

    expect(mockEstimate).toHaveBeenCalledTimes(1);
  });
});
