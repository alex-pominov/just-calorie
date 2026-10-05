import type * as ChatGPTAuthMock from '@tests/chatgpt-auth.mock';
import { findNodeHandle, FlatList, I18nManager, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';
import { ChatGPTAuthError, openChatGPTUsageSettings, signInWithChatGPT, signOutOfChatGPT } from '@/modules/chatgpt-auth';
import { EstimateError, estimateCalories } from '@/modules/calorie-estimate';
import { mockChatGPTAccount, setMockChatGPTAccount } from '@tests/chatgpt-auth.mock';

import { TrackWithAiScreen } from './TrackWithAiScreen';

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

jest.mock('@/features/tracking', () => ({
  ...jest.requireActual('@/features/tracking'),
  useAddEntry: () => jest.fn(() => Promise.resolve()),
  useTodayKey: () => '2026-10-04',
}));

// react-native exports these lazily; touching them here loads their modules, findNodeHandle the renderer, outside
// any timed test (backlog #8).
const PRELOADED = [findNodeHandle, FlatList, I18nManager, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View];

const mockSignIn = jest.mocked(signInWithChatGPT);
const mockSignOut = jest.mocked(signOutOfChatGPT);
const mockOpenUsage = jest.mocked(openChatGPTUsageSettings);
const mockEstimate = jest.mocked(estimateCalories);

const openTrack = async () => {
  await renderRouter(
    { index: () => <Text>main screen</Text>, track: () => <TrackWithAiScreen dayKey="2026-10-04" /> },
    { initialUrl: '/track' },
  );
};

const sendText = async (text: string) => {
  await fireEvent.changeText(screen.getByTestId('chat-input'), text);
  await fireEvent.press(screen.getByTestId('chat-send'));
};

describe('Track with AI and the ChatGPT account (Figma 24:4273, 24:4327)', () => {
  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openTrack();
    await screen.unmount();
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockChatGPTAccount.status = 'signed-out';
    mockChatGPTAccount.hasSavedAccount = false;
  });

  describe('signed out (24:4273)', () => {
    it('shows only the line and the Sign In pill, with no chat, input row or account row, and the pill signs in', async () => {
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-sign-in-button'));

      expect(screen.getByRole('header', { name: 'Track with AI' })).toBeOnTheScreen();
      expect(screen.getByText('To activate AI features')).toBeOnTheScreen();
      expect(screen.getByText('Sign In with ChatGPT')).toBeOnTheScreen();
      expect(screen.queryByTestId('chat-input-row')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('chat-messages')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('new-chat-prompt')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('chatgpt-sign-out')).not.toBeOnTheScreen();
      expect(mockSignIn.mock.calls).toEqual([[{ newAccount: false }]]);
    });

    it('offers another ChatGPT account under the pill once an account has signed in here, and registers it on a tap', async () => {
      mockChatGPTAccount.hasSavedAccount = true;
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-use-another-account'));

      expect(screen.getByText('Use a different ChatGPT account')).toBeOnTheScreen();
      expect(mockSignIn.mock.calls).toEqual([[{ newAccount: true }]]);
    });

    it.each<[string, ChatGPTSessionStatus, boolean]>([
      ['on a phone where nobody has signed in', 'signed-out', false],
      ['while a sign-in is open', 'signing-in', true],
      ['once signed in', 'signed-in', true],
    ])('offers no other account %s', async (_case, status, saved) => {
      mockChatGPTAccount.status = status;
      mockChatGPTAccount.hasSavedAccount = saved;

      await openTrack();

      expect(screen.queryByTestId('chatgpt-use-another-account')).not.toBeOnTheScreen();
    });

    it('reads Signing in…, disabled, while a sign-in is open', async () => {
      mockChatGPTAccount.status = 'signing-in';

      await openTrack();

      expect(screen.getByText('Signing in…')).toBeOnTheScreen();
      expect(screen.getByTestId('chatgpt-sign-in-button')).toBeDisabled();
    });

    it.each([
      ['unavailable', "Sign in with ChatGPT isn't available in this build of the app."],
      ['denied', 'ChatGPT sign-in was declined.'],
      ['plan-not-allowed', "Just Calorie wasn't allowed to use your ChatGPT plan, so it can't estimate with it."],
      ['network', "Couldn't reach ChatGPT. Check your connection and try again."],
      ['failed', "ChatGPT sign-in didn't finish. Please try again."],
      ['another-account', "That isn't the ChatGPT account saved on this phone. To add it, tap Use a different ChatGPT account."],
    ] as const)("says under the pill why a sign-in that ended in '%s' did not happen", async (kind, copy) => {
      mockSignIn.mockRejectedValueOnce(new ChatGPTAuthError(kind));
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-sign-in-button'));

      expect(await screen.findByText(copy)).toBeOnTheScreen();
    });

    it('says nothing when the user cancels the sign-in', async () => {
      mockSignIn.mockResolvedValueOnce('cancelled');
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-sign-in-button'));

      await expect(mockSignIn.mock.results[0]?.value).resolves.toBe('cancelled');
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  describe('signed in (24:4327)', () => {
    beforeEach(() => {
      mockChatGPTAccount.status = 'signed-in';
      mockChatGPTAccount.hasSavedAccount = true;
    });

    it('shows the new-chat prompt above the input row, and Sign Out from GPT under it signs out', async () => {
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-sign-out'));

      expect(screen.getByText('What have I eaten today?')).toBeOnTheScreen();
      expect(screen.getByTestId('chat-input-row')).toBeOnTheScreen();
      expect(screen.getByText('Sign Out from GPT')).toBeOnTheScreen();
      expect(screen.queryByTestId('chatgpt-sign-in')).not.toBeOnTheScreen();
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('carries none of the old account row', async () => {
      await openTrack();

      expect(screen.queryByText('Using ChatGPT plan')).not.toBeOnTheScreen();
      expect(screen.queryByText('Manage usage')).not.toBeOnTheScreen();
      expect(screen.queryByText('Continue with ChatGPT')).not.toBeOnTheScreen();
      expect(screen.queryByTestId('chatgpt-account')).not.toBeOnTheScreen();
    });

    it("asks for the Sign In with ChatGPT the screen offers when a send finds nobody signed in", async () => {
      mockEstimate.mockRejectedValueOnce(new EstimateError('missing-auth'));
      await openTrack();

      await sendText('two eggs');

      expect(await screen.findByText('Sign in with ChatGPT to get calorie estimates.')).toBeOnTheScreen();
      expect(screen.queryByText(/Continue with ChatGPT/)).not.toBeOnTheScreen();
    });

    it('reads Signing out…, disabled, while a sign-out is still finishing', async () => {
      mockChatGPTAccount.status = 'signing-out';

      await openTrack();

      expect(screen.getByText('Signing out…')).toBeOnTheScreen();
      expect(screen.getByTestId('chatgpt-sign-out')).toBeDisabled();
    });

    it('drops the new-chat prompt once the chat has a message, and keeps Sign Out from GPT', async () => {
      mockEstimate.mockResolvedValueOnce({ reply: 'Two eggs, about 150 kcal.', kcal: 150 });
      await openTrack();

      await sendText('two eggs');

      expect(await screen.findByText('Two eggs, about 150 kcal.')).toBeOnTheScreen();
      expect(screen.queryByTestId('new-chat-prompt')).not.toBeOnTheScreen();
      expect(screen.getByTestId('chatgpt-sign-out')).toBeOnTheScreen();
    });

    it.each([
      ['ChatGPT did not confirm the sign-out', () => mockSignOut.mockResolvedValueOnce({ revoked: false }), /ChatGPT didn't confirm it/],
      ['the sign-out failed', () => mockSignOut.mockRejectedValueOnce(new ChatGPTAuthError('failed')), "Couldn't sign out. Please try again."],
    ] as const)('says under Sign Out from GPT when %s', async (_case, arrange, copy) => {
      arrange();
      await openTrack();

      await fireEvent.press(screen.getByTestId('chatgpt-sign-out'));

      expect(await screen.findByText(copy)).toBeOnTheScreen();
    });

    it.each(['usage-limit', 'plan-unavailable'] as const)("opens ChatGPT's usage settings from the %s line", async (kind) => {
      mockEstimate.mockRejectedValueOnce(new EstimateError(kind));
      await openTrack();

      await sendText('two eggs');
      await fireEvent.press(await screen.findByTestId('usage-settings-link'));

      expect(screen.getByText('ChatGPT settings')).toBeOnTheScreen();
      expect(mockOpenUsage).toHaveBeenCalledTimes(1);
    });

    it('offers no settings link on a reply that failed for another reason', async () => {
      mockEstimate.mockRejectedValueOnce(new EstimateError('network'));
      await openTrack();

      await sendText('two eggs');

      expect(await screen.findByRole('alert')).toBeOnTheScreen();
      expect(screen.queryByTestId('usage-settings-link')).not.toBeOnTheScreen();
    });

    it('starts a new chat when the user signs in again after signing out, so one account never sees another’s messages', async () => {
      mockEstimate.mockResolvedValueOnce({ reply: 'Two eggs, about 150 kcal.', kcal: 150 });
      await openTrack();
      await sendText('two eggs');
      await screen.findByText('Two eggs, about 150 kcal.');

      await act(() => setMockChatGPTAccount({ status: 'signed-out' }));

      expect(screen.getByTestId('chatgpt-sign-in')).toBeOnTheScreen();

      await act(() => setMockChatGPTAccount({ status: 'signed-in' }));

      expect(screen.getByTestId('new-chat-prompt')).toBeOnTheScreen();
      expect(screen.queryByText('two eggs')).not.toBeOnTheScreen();
      expect(screen.queryByText('Two eggs, about 150 kcal.')).not.toBeOnTheScreen();
    });

    it('stops a reply still in flight, and clears the chat, the moment the session starts signing out', async () => {
      const seen: { signal: AbortSignal | undefined } = { signal: undefined };
      mockEstimate.mockImplementationOnce((_request, options) => {
        seen.signal = options?.signal;

        return new Promise(() => undefined);
      });
      await openTrack();
      await sendText('two eggs');

      await act(() => setMockChatGPTAccount({ status: 'signing-out' }));

      expect(seen.signal?.aborted).toBe(true);
      expect(screen.queryByText('two eggs')).not.toBeOnTheScreen();
      expect(screen.getByTestId('new-chat-prompt')).toBeOnTheScreen();
      expect(screen.getByText('Signing out…')).toBeOnTheScreen();
    });

    it('stops a reply still in flight when the session ends without a sign-out', async () => {
      const seen: { signal: AbortSignal | undefined } = { signal: undefined };
      mockEstimate.mockImplementationOnce((_request, options) => {
        seen.signal = options?.signal;

        return new Promise(() => undefined);
      });
      await openTrack();
      await sendText('two eggs');

      await act(() => setMockChatGPTAccount({ status: 'signed-out' }));

      expect(seen.signal?.aborted).toBe(true);
    });

    it("says so under Sign Out from GPT when ChatGPT's settings would not open", async () => {
      mockOpenUsage.mockRejectedValueOnce(new ChatGPTAuthError('failed'));
      mockEstimate.mockRejectedValueOnce(new EstimateError('usage-limit'));
      await openTrack();

      await sendText('two eggs');
      await fireEvent.press(await screen.findByTestId('usage-settings-link'));

      expect(await screen.findByText("Couldn't open ChatGPT settings. Please try again.")).toBeOnTheScreen();
    });
  });

  it('shows neither state until the Keychain has been read', async () => {
    mockChatGPTAccount.status = 'loading';

    await openTrack();

    expect(screen.getByRole('header', { name: 'Track with AI' })).toBeOnTheScreen();
    expect(screen.queryByTestId('chatgpt-sign-in')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('chat-input-row')).not.toBeOnTheScreen();
  });
});
