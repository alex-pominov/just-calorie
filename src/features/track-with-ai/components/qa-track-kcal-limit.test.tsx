import {
  ActivityIndicator,
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
import { renderRouter, screen, fireEvent, waitFor } from 'expo-router/testing-library';

import { estimateCalories } from '@/modules/calorie-estimate';

import { TrackWithAiScreen } from './TrackWithAiScreen';

// QA reproduction (track-with-ai, round 1a). The estimator accepts any safe integer >= 1 as kcal, while
// tracking's addEntry refuses anything above MAX_KCAL (10,000, src/features/tracking/services/kcal.service.ts).
// An estimate between the two is shown with an enabled Add that can never succeed.
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
// timeout covers. Under host load that cold load, inside this file's only test, outlasted its 5 s budget (f-867240).
// FlatList reads ScrollView and I18nManager as it first renders, so they are touched here too.
const PRELOADED = [
  ActivityIndicator,
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

describe('qa: Track with AI never offers an Add the data layer refuses', () => {
  // The screen's first render, with its modules already loaded, so the timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await renderRouter(routes, { initialUrl: '/track' });
    await screen.unmount();
  });

  it('shows no enabled Add for an estimate above 10,000 kcal', async () => {
    mockEstimate.mockResolvedValue({ reply: 'A whole cake and two pizzas, about 12000 kcal.', kcal: 12_000 });
    // What tracking's real addEntry does for 12000: assertValidKcal throws InvalidKcalError before any write.
    mockAddEntry.mockRejectedValue(new Error('kcal must be a whole number from 1 to 10000'));
    await renderRouter(routes, { initialUrl: '/track' });

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'a whole cake and two pizzas');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() => expect(screen.queryByLabelText('Estimating')).not.toBeOnTheScreen());

    expect(screen.queryByRole('button', { name: /Add 12000 kcal to today/, disabled: false })).not.toBeOnTheScreen();
  });
});
