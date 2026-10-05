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
import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as Haptics from 'expo-haptics';

import type { CalorieEstimate } from '@/modules/calorie-estimate';
import { EstimateError, estimateCalories } from '@/modules/calorie-estimate';

import { TrackWithAiScreen } from './TrackWithAiScreen';

// The chat shows only when signed in (Figma 24:4327); these tests drive the chat.
jest.mock('@/modules/chatgpt-auth', () => jest.requireActual<typeof ChatGPTAuthMock>('@tests/chatgpt-auth.mock').chatGPTAuthMock);

jest.mock('@/modules/calorie-estimate', () => ({
  ...jest.requireActual('@/modules/calorie-estimate'),
  estimateCalories: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
}));

const mockAddEntry = jest.fn();
const TODAY = '2026-10-04';

jest.mock('@/features/tracking', () => ({
  ...jest.requireActual('@/features/tracking'),
  useAddEntry: () => mockAddEntry,
  useTodayKey: () => TODAY,
}));

const mockEstimate = jest.mocked(estimateCalories);

const routes = {
  index: () => <Text testID="main-screen">main screen</Text>,
  track: () => <TrackWithAiScreen dayKey={TODAY} />,
};

const openTrack = async (initialUrl = '/track', screens = routes) => {
  const rendered = renderRouter(screens, { initialUrl });
  const { getPathname } = rendered;
  await rendered;

  return getPathname;
};

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });

  return { promise, resolve, reject };
}

const type = (text: string) => fireEvent.changeText(screen.getByTestId('chat-input'), text);
const pressSend = () => fireEvent.press(screen.getByTestId('chat-send'));

async function sendText(text: string) {
  await type(text);
  await pressSend();
}

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

describe('TrackWithAiScreen', () => {
  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openTrack();
    await screen.unmount();
    // renderRouter switched to fake timers; the tests start on real ones, as they did before this warm-up.
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockEstimate.mockResolvedValue({ reply: 'Two eggs, about 150 kcal.', kcal: 150 });
    mockAddEntry.mockResolvedValue(undefined);
  });

  it('renders the frame: header, Close, and the empty input row', async () => {
    await openTrack();

    expect(screen.getByRole('header', { name: 'Track with AI' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Type here...')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeOnTheScreen();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('shows the user message at once, then the reply with its figure and Add', async () => {
    const reply = deferred<CalorieEstimate>();
    mockEstimate.mockReturnValue(reply.promise);
    await openTrack();

    await sendText('  two eggs ');

    expect(mockEstimate).toHaveBeenCalledWith({ text: 'two eggs' }, { signal: expect.any(Object) });
    expect(screen.getByText('two eggs')).toBeOnTheScreen();
    // VoiceOver reads the accessible wrapper; the indicator inside it is hidden so it is not read as 'In progress'.
    expect(screen.getByLabelText('Estimating').props.accessible).toBe(true);
    expect(screen.getByTestId('estimating-indicator', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('chat-input').props.value).toBe('');

    await act(async () => reply.resolve({ reply: 'Two eggs, about 150 kcal.', kcal: 150 }));

    expect(screen.queryByLabelText('Estimating')).not.toBeOnTheScreen();
    expect(screen.getByText('Two eggs, about 150 kcal.')).toBeOnTheScreen();
    expect(screen.getByText('+150')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add 150 kcal to today' })).toBeEnabled();
  });

  it('shows a reply with no kcal as the sentence alone', async () => {
    mockEstimate.mockResolvedValue({ reply: 'I cannot see any food here.', kcal: null });
    await openTrack();

    await sendText('a chair');

    expect(await screen.findByText('I cannot see any food here.')).toBeOnTheScreen();
    expect(screen.queryByText(/^\+/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /kcal to today/ })).not.toBeOnTheScreen();
  });

  it.each([
    ['missing-auth', 'Sign in with ChatGPT to get calorie estimates.'],
    ['network', "I couldn't reach the estimate service. Check your connection and try again."],
    ['api', 'The estimate service returned an error. Please try again in a moment.'],
    ['usage-limit', "You've reached your ChatGPT usage limit. You can review it in ChatGPT settings."],
    ['plan-unavailable', "Your ChatGPT plan can't be used for estimates here. You can check your plan in ChatGPT settings."],
    ['invalid-response', "I couldn't read that estimate. Please try again."],
  ] as const)("shows the %s error in the chat and lets the user send again", async (kind, copy) => {
    mockEstimate.mockRejectedValueOnce(new EstimateError(kind));
    await openTrack();

    await sendText('toast');

    expect(await screen.findByText(copy)).toBeOnTheScreen();
    expect(screen.getByText('toast')).toBeOnTheScreen();

    await sendText('toast again');

    expect(await screen.findByText('+150')).toBeOnTheScreen();
    expect(mockEstimate).toHaveBeenCalledTimes(2);
  });

  it('shows a failure that is not an EstimateError as a generic message, never a crash', async () => {
    mockEstimate.mockRejectedValueOnce(new TypeError('boom'));
    await openTrack();

    await sendText('toast');

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeOnTheScreen();
  });

  it("adds exactly the estimate to today, then shows 'Added' and refuses a second add", async () => {
    await openTrack();
    await sendText('two eggs');
    const add = await screen.findByRole('button', { name: 'Add 150 kcal to today' });

    await fireEvent.press(add);

    expect(mockAddEntry).toHaveBeenCalledWith({ dayKey: TODAY, kind: 'add', kcal: 150 });
    const added = await screen.findByRole('button', { name: 'Added 150 kcal to today' });
    expect(added).toBeDisabled();
    expect(screen.getByText('Added')).toBeOnTheScreen();

    await fireEvent.press(added);
    expect(mockAddEntry).toHaveBeenCalledTimes(1);
  });

  it('adds the estimate to the past day it was opened on, naming that day', async () => {
    mockAddEntry.mockRejectedValueOnce(new Error('disk full'));
    await openTrack('/track', { ...routes, track: () => <TrackWithAiScreen dayKey="2026-10-02" /> });
    await sendText('two eggs');

    await fireEvent.press(await screen.findByRole('button', { name: 'Add 150 kcal to Friday 2 October' }));
    expect(await screen.findByText("Couldn't add it to Friday 2 October. Please try again.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 150 kcal to Friday 2 October' }));

    expect(mockAddEntry).toHaveBeenLastCalledWith({ dayKey: '2026-10-02', kind: 'add', kcal: 150 });
    expect(await screen.findByRole('button', { name: 'Added 150 kcal to Friday 2 October' })).toBeDisabled();
  });

  it('taps once with a light impact when the estimate is stored, and not for an add that failed', async () => {
    mockAddEntry.mockRejectedValueOnce(new Error('disk full'));
    await openTrack();
    await sendText('two eggs');

    await fireEvent.press(await screen.findByRole('button', { name: 'Add 150 kcal to today' }));
    expect(await screen.findByText("Couldn't add it to today. Please try again.")).toBeOnTheScreen();
    const afterFailure = jest.mocked(Haptics.impactAsync).mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Add 150 kcal to today' }));
    expect(await screen.findByText('Added')).toBeOnTheScreen();

    await waitFor(() => expect(Haptics.impactAsync).toHaveBeenCalledTimes(1));
    expect(afterFailure).toBe(0);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('shows a failed add and leaves Add usable', async () => {
    mockAddEntry.mockRejectedValueOnce(new Error('disk full'));
    await openTrack();
    await sendText('two eggs');

    await fireEvent.press(await screen.findByRole('button', { name: 'Add 150 kcal to today' }));

    expect(await screen.findByText("Couldn't add it to today. Please try again.")).toBeOnTheScreen();
    const retry = screen.getByRole('button', { name: 'Add 150 kcal to today' });
    expect(retry).toBeEnabled();

    await fireEvent.press(retry);

    expect(await screen.findByText('Added')).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't add it to today. Please try again.")).not.toBeOnTheScreen();
    expect(mockAddEntry).toHaveBeenCalledTimes(2);
  });

  it('keeps send disabled for an empty or blank field', async () => {
    await openTrack();

    await type('   ');
    await pressSend();

    expect(screen.getByTestId('chat-send')).toBeDisabled();
    expect(mockEstimate).not.toHaveBeenCalled();
  });

  it('keeps send disabled while a reply is outstanding', async () => {
    const reply = deferred<CalorieEstimate>();
    mockEstimate.mockReturnValue(reply.promise);
    await openTrack();
    await sendText('two eggs');

    await type('and toast');
    expect(screen.getByTestId('chat-send')).toBeDisabled();
    await pressSend();
    await fireEvent(screen.getByTestId('chat-input'), 'submitEditing');
    expect(mockEstimate).toHaveBeenCalledTimes(1);

    await act(async () => reply.resolve({ reply: 'Two eggs.', kcal: 150 }));

    expect(screen.getByTestId('chat-send')).toBeEnabled();
  });

  it('sends from the keyboard return key', async () => {
    await openTrack();
    await type('an apple');

    await fireEvent(screen.getByTestId('chat-input'), 'submitEditing');

    await waitFor(() => expect(mockEstimate).toHaveBeenCalledWith({ text: 'an apple' }, { signal: expect.any(Object) }));
  });

  it('closes back to the screen that opened it', async () => {
    const getPathname = await openTrack('/');
    await act(() => router.push('/track'));

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(getPathname()).toBe('/');
    expect(screen.getByTestId('main-screen')).toBeOnTheScreen();
    expect(router.canGoBack()).toBe(false);
  });

  it('closes a deep-linked /track to the main screen', async () => {
    const getPathname = await openTrack('/track');
    expect(router.canGoBack()).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(getPathname()).toBe('/');
    expect(screen.getByTestId('main-screen')).toBeOnTheScreen();
  });

  it('starts empty every time it opens: the conversation is not kept', async () => {
    await openTrack('/');
    await act(() => router.push('/track'));
    await sendText('two eggs');
    expect(await screen.findByText('+150')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await act(() => router.push('/track'));

    expect(screen.queryByText('two eggs')).not.toBeOnTheScreen();
    expect(screen.queryByText('+150')).not.toBeOnTheScreen();
  });
});
