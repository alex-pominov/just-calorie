import type * as ChatGPTAuthMock from '@tests/chatgpt-auth.mock';
import {
  ActionSheetIOS,
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
import {
  PermissionStatus,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
} from 'expo-image-picker';

import { ImageManipulator } from 'expo-image-manipulator';

import type { CalorieEstimate } from '@/modules/calorie-estimate';
import { estimateCalories } from '@/modules/calorie-estimate';

import { TrackWithAiScreen } from './TrackWithAiScreen';

// The chat shows only when signed in (Figma 24:4327); these tests drive the chat.
jest.mock('@/modules/chatgpt-auth', () => jest.requireActual<typeof ChatGPTAuthMock>('@tests/chatgpt-auth.mock').chatGPTAuthMock);

jest.mock('@/modules/calorie-estimate', () => ({
  ...jest.requireActual('@/modules/calorie-estimate'),
  estimateCalories: jest.fn(),
}));

jest.mock('@/features/tracking', () => ({
  ...jest.requireActual('@/features/tracking'),
  useAddEntry: () => jest.fn(),
  useTodayKey: () => '2026-10-04',
}));

const mockDevice = { isDevice: true };

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: { manipulate: jest.fn() },
}));

jest.mock('expo-image-picker', () => ({
  PermissionStatus: jest.requireActual('expo-image-picker').PermissionStatus,
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

const SHEET = { camera: 0, library: 1, cancel: 2 } as const;
const granted = { granted: true, status: PermissionStatus.GRANTED, canAskAgain: true, expires: 'never' } as const;
const denied = { granted: false, status: PermissionStatus.DENIED, canAskAgain: false, expires: 'never' } as const;
// A picked photo's pixel size, which the picker reports and the estimate never reads.
const [width, height] = [800, 600];
const asset = { uri: 'file:///lunch.jpg', width, height, mimeType: 'image/jpeg' };
const SCALED = { uri: 'file:///lunch-scaled.jpg', base64: 'U0NBTEVE' };
const SENT_PHOTO = { base64: SCALED.base64, mimeType: 'image/jpeg' };
const mockEstimate = jest.mocked(estimateCalories);

let sheetChoice: number = SHEET.library;

const routes = {
  index: () => <Text testID="main-screen">main screen</Text>,
  track: () => <TrackWithAiScreen dayKey="2026-10-04" />,
};

async function openTrack() {
  const rendered = renderRouter(routes, { initialUrl: '/track' });
  await rendered;
}

const attach = (choice: number) => {
  sheetChoice = choice;

  return fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
};

// react-native exports these lazily, so touching them here loads their modules while the file is set up, which no
// timeout covers; findNodeHandle loads react-native's renderer, the largest of them. Under host load that cold load,
// inside the first test, can outlast its 5 s budget (backlog #8).
// FlatList reads ScrollView and I18nManager as it first renders, and beforeEach spies on ActionSheetIOS, so they are
// touched here too.
const PRELOADED = [
  ActionSheetIOS,
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

describe('TrackWithAiScreen photos', () => {
  // The screen's first render, with its modules already loaded, so the first timed test starts warm.
  beforeAll(async () => {
    expect(PRELOADED).not.toContain(undefined);
    await openTrack();
    await screen.unmount();
    // renderRouter switched to fake timers; the tests start on real ones, as they did before this warm-up.
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockDevice.isDevice = true;
    sheetChoice = SHEET.library;
    jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation((_options, callback) => callback(sheetChoice));
    jest.mocked(requestMediaLibraryPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [asset] });
    jest.mocked(launchCameraAsync).mockResolvedValue({ canceled: false, assets: [asset] });
    mockEstimate.mockResolvedValue({ reply: 'A sandwich, about 450 kcal.', kcal: 450 } satisfies CalorieEstimate);
    const saveAsync = jest.fn().mockResolvedValue({ ...SCALED, width, height });
    const context = { resize: jest.fn(), renderAsync: jest.fn().mockResolvedValue({ saveAsync }) };
    jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
  });

  it('offers Take photo, Choose from library and Cancel', async () => {
    await openTrack();
    await attach(SHEET.cancel);

    expect(ActionSheetIOS.showActionSheetWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ options: ['Take photo', 'Choose from library', 'Cancel'], cancelButtonIndex: 2 }),
      expect.any(Function),
    );
  });

  it('previews a library pick, sends it alone, and asks for an estimate of its scaled JPEG data', async () => {
    await openTrack();
    await attach(SHEET.library);

    expect(screen.getByLabelText('Attached photo')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-send')).toBeEnabled();

    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(mockEstimate).toHaveBeenCalledWith({ text: '', photo: SENT_PHOTO }, { signal: expect.any(Object) });
    expect(screen.queryByLabelText('Attached photo')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Sent photo')).toBeOnTheScreen();
    expect(await screen.findByText('+450')).toBeOnTheScreen();
  });

  it('sends typed text and the photo together as one message', async () => {
    await openTrack();
    await attach(SHEET.library);
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'my lunch');

    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(mockEstimate).toHaveBeenCalledTimes(1);
    expect(mockEstimate).toHaveBeenCalledWith({ text: 'my lunch', photo: SENT_PHOTO }, { signal: expect.any(Object) });
    expect(screen.getByText('my lunch')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sent photo')).toBeOnTheScreen();
  });

  it('takes a photo with the camera', async () => {
    await openTrack();
    await attach(SHEET.camera);

    expect(launchCameraAsync).toHaveBeenCalled();
    expect(screen.getByLabelText('Attached photo')).toBeOnTheScreen();
  });

  it('removes an attached photo before it is sent', async () => {
    await openTrack();
    await attach(SHEET.library);

    await fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));

    expect(screen.queryByLabelText('Attached photo')).not.toBeOnTheScreen();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('adds nothing when the sheet or the picker is cancelled', async () => {
    await openTrack();
    await attach(SHEET.cancel);
    expect(launchImageLibraryAsync).not.toHaveBeenCalled();

    jest.mocked(launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null });
    await attach(SHEET.library);

    expect(screen.queryByLabelText('Attached photo')).not.toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.getByTestId('chat-send')).toBeDisabled();
  });

  it('says so when camera access is refused', async () => {
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue(denied);
    await openTrack();

    await attach(SHEET.camera);

    expect(screen.getByText('Camera access is off. Turn it on in Settings to take a photo.')).toBeOnTheScreen();
  });

  it('says so on a device with no camera (the simulator) and never launches it', async () => {
    mockDevice.isDevice = false;
    await openTrack();

    await attach(SHEET.camera);

    expect(screen.getByText("The camera isn't available right now.")).toBeOnTheScreen();
    expect(launchCameraAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeOnTheScreen();
  });

  it('says so when the camera fails to open, and does not crash', async () => {
    jest.mocked(launchCameraAsync).mockRejectedValue(new Error('Camera failed'));
    await openTrack();

    await attach(SHEET.camera);

    expect(screen.getByText("The camera isn't available right now.")).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeOnTheScreen();
  });

  it('clears the note once a photo is picked', async () => {
    mockDevice.isDevice = false;
    await openTrack();
    await attach(SHEET.camera);

    await attach(SHEET.library);

    expect(screen.queryByText("The camera isn't available right now.")).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Attached photo')).toBeOnTheScreen();
  });

  it('previews the scaled photo, the one that is sent', async () => {
    await openTrack();
    await attach(SHEET.library);

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///lunch.jpg');
    expect(screen.getByLabelText('Attached photo').props.source).toEqual({ uri: SCALED.uri });
  });

  it('says so when the photo cannot be scaled, and attaches nothing', async () => {
    jest.mocked(ImageManipulator.manipulate).mockImplementation(() => {
      throw new Error('cannot decode');
    });
    await openTrack();

    await attach(SHEET.library);

    expect(screen.getByText("Couldn't open that photo. Please try again.")).toBeOnTheScreen();
    expect(screen.queryByLabelText('Attached photo')).not.toBeOnTheScreen();
  });

  it('opens the library without asking for photo access', async () => {
    await openTrack();

    await attach(SHEET.library);

    expect(requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Attached photo')).toBeOnTheScreen();
  });

  it('keeps the photo out of the next message once sent', async () => {
    await openTrack();
    await attach(SHEET.library);
    await fireEvent.press(screen.getByTestId('chat-send'));
    await screen.findByText('+450');

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'and a coffee');
    await act(() => fireEvent.press(screen.getByTestId('chat-send')));

    expect(mockEstimate).toHaveBeenLastCalledWith({ text: 'and a coffee' }, { signal: expect.any(Object) });
  });
});
