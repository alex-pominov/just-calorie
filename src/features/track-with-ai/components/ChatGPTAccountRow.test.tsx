import { findNodeHandle, Pressable, Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { ChatGPTSessionStatus } from '@/modules/chatgpt-auth';
import type * as AuthErrorModule from '@/modules/chatgpt-auth/chatgpt-auth-error';
import { ChatGPTAuthError, openChatGPTUsageSettings, signInWithChatGPT, signOutOfChatGPT } from '@/modules/chatgpt-auth';

import { ChatGPTAccountRow } from './ChatGPTAccountRow';

const mockStatus: { current: ChatGPTSessionStatus } = { current: 'signed-out' };

jest.mock('@/modules/chatgpt-auth', () => {
  const { ChatGPTAuthError: RealError } = jest.requireActual<typeof AuthErrorModule>(
    '@/modules/chatgpt-auth/chatgpt-auth-error',
  );

  return {
    ChatGPTAuthError: RealError,
    useChatGPTSessionStatus: () => mockStatus.current,
    signInWithChatGPT: jest.fn(() => Promise.resolve('signed-in')),
    signOutOfChatGPT: jest.fn(() => Promise.resolve({ revoked: true })),
    openChatGPTUsageSettings: jest.fn(() => Promise.resolve()),
  };
});

// react-native exports these lazily; touching them here loads their modules, findNodeHandle the renderer, outside
// any timed test (backlog #8).
const PRELOADED = [findNodeHandle, Pressable, Text, View];

const mockSignIn = jest.mocked(signInWithChatGPT);
const mockSignOut = jest.mocked(signOutOfChatGPT);

describe('ChatGPTAccountRow', () => {
  // The row's first render, with its modules already loaded, so the timed tests start warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await render(<ChatGPTAccountRow />);
    await screen.unmount();
  });

  beforeEach(() => {
    mockStatus.current = 'signed-out';
  });

  it('shows Continue with ChatGPT when signed out, and starts the sign-in on a tap', async () => {
    await render(<ChatGPTAccountRow />);

    await fireEvent.press(screen.getByTestId('chatgpt-continue'));

    expect(screen.getByText('Continue with ChatGPT')).toBeOnTheScreen();
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows nothing until the Keychain has been read', async () => {
    mockStatus.current = 'loading';

    await render(<ChatGPTAccountRow />);

    expect(screen.queryByTestId('chatgpt-account')).not.toBeOnTheScreen();
  });

  it('disables the button while a sign-in is open', async () => {
    mockStatus.current = 'signing-in';

    await render(<ChatGPTAccountRow />);

    expect(screen.getByText('Signing in…')).toBeOnTheScreen();
    expect(screen.getByTestId('chatgpt-continue')).toBeDisabled();
  });

  it('disables the button while a sign-out is still finishing', async () => {
    mockStatus.current = 'signing-out';

    await render(<ChatGPTAccountRow />);

    expect(screen.getByText('Signing out…')).toBeOnTheScreen();
    expect(screen.getByTestId('chatgpt-continue')).toBeDisabled();
  });

  it('shows the plan line with Manage usage and Sign out once signed in', async () => {
    mockStatus.current = 'signed-in';

    await render(<ChatGPTAccountRow />);

    await fireEvent.press(screen.getByTestId('chatgpt-manage-usage'));
    await fireEvent.press(screen.getByTestId('chatgpt-sign-out'));

    expect(screen.getByText('Using ChatGPT plan')).toBeOnTheScreen();
    expect(screen.queryByText('Continue with ChatGPT')).not.toBeOnTheScreen();
    expect(jest.mocked(openChatGPTUsageSettings)).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unavailable', "Sign in with ChatGPT isn't available in this version of the app yet."],
    ['denied', 'ChatGPT sign-in was declined.'],
    ['plan-not-allowed', "Just Calorie wasn't allowed to use your ChatGPT plan, so it can't estimate with it."],
    ['network', "Couldn't reach ChatGPT. Check your connection and try again."],
    ['failed', "ChatGPT sign-in didn't finish. Please try again."],
  ] as const)("says why a sign-in that ended in '%s' did not happen", async (kind, copy) => {
    mockSignIn.mockRejectedValueOnce(new ChatGPTAuthError(kind));
    await render(<ChatGPTAccountRow />);

    await fireEvent.press(screen.getByTestId('chatgpt-continue'));

    expect(await screen.findByText(copy)).toBeOnTheScreen();
  });

  it('says nothing when the user cancels the sign-in', async () => {
    mockSignIn.mockResolvedValueOnce('cancelled');
    await render(<ChatGPTAccountRow />);

    await fireEvent.press(screen.getByTestId('chatgpt-continue'));

    await expect(mockSignIn.mock.results[0]?.value).resolves.toBe('cancelled');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('tells the user when ChatGPT did not confirm the sign-out', async () => {
    mockStatus.current = 'signed-in';
    mockSignOut.mockResolvedValueOnce({ revoked: false });
    await render(<ChatGPTAccountRow />);

    await fireEvent.press(screen.getByTestId('chatgpt-sign-out'));

    expect(await screen.findByText(/ChatGPT didn't confirm it/)).toBeOnTheScreen();
  });
});
