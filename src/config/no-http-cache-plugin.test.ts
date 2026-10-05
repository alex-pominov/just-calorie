import withNoHttpCache from '../../plugins/with-no-http-cache';
import appJson from '../../app.json';

const { addNoHttpCache } = withNoHttpCache as unknown as { addNoHttpCache: (contents: string) => string };

// The didFinishLaunching shape Expo SDK 57's prebuild writes (ios/JustCalorie/AppDelegate.swift).
const APP_DELEGATE = `class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('the no-HTTP-cache config plugin', () => {
  it('replaces the shared URL cache with an empty one before React Native starts', () => {
    const contents = addNoHttpCache(APP_DELEGATE);

    const cacheLine = contents.indexOf('URLCache.shared = URLCache(memoryCapacity: 0, diskCapacity: 0, directory: nil)');
    expect(cacheLine).toBeGreaterThan(contents.indexOf(') -> Bool {'));
    expect(cacheLine).toBeLessThan(contents.indexOf('let delegate = ReactNativeDelegate()'));
    expect(contents.indexOf('URLCache.shared.removeAllCachedResponses()')).toBeLessThan(cacheLine);
  });

  it('adds its lines once however often prebuild runs', () => {
    const once = addNoHttpCache(APP_DELEGATE);

    expect(addNoHttpCache(once)).toBe(once);
  });

  it('fails the prebuild, rather than skipping, when the AppDelegate has no launch method to extend', () => {
    expect(() => addNoHttpCache('class AppDelegate {}')).toThrow('didFinishLaunchingWithOptions');
  });

  it('is applied by app.json', () => {
    expect(appJson.expo.plugins).toContain('./plugins/with-no-http-cache');
  });
});
