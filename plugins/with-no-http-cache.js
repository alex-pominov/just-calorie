// Config plugin: the app caches no HTTP response, in memory or on disk.
// iOS's shared URL cache otherwise stores OpenAI requests WITH their Authorization header, and the token endpoint's
// response WITH its tokens, in Library/Caches/<bundle id>/Cache.db, an SQLite file (measured 2026-10-04 on the
// simulator). A request header cannot stop it; only the session's cache can, so the shared cache is replaced at
// launch, before React Native or expo/fetch creates a URLSession from it.
const { withAppDelegate } = require('expo/config-plugins');

const MARKER = 'with-no-http-cache';

const LINES = [
  `    // ${MARKER}: purge what an older build cached, then cache nothing (plugins/with-no-http-cache.js).`,
  '    URLCache.shared.removeAllCachedResponses()',
  '    URLCache.shared = URLCache(memoryCapacity: 0, diskCapacity: 0, directory: nil)',
  '',
].join('\n');

const LAUNCH = /didFinishLaunchingWithOptions[^{]*\{\n/;

/** Adds the cache lines at the top of didFinishLaunching; throws rather than skipping a template it cannot read. */
function addNoHttpCache(contents) {
  if (contents.includes(MARKER)) return contents;

  const launch = LAUNCH.exec(contents);

  if (launch === null) throw new Error(`${MARKER}: the AppDelegate has no didFinishLaunchingWithOptions to add the cache lines to`);

  const at = launch.index + launch[0].length;

  return `${contents.slice(0, at)}${LINES}${contents.slice(at)}`;
}

function withNoHttpCache(config) {
  return withAppDelegate(config, (appDelegate) => {
    if (appDelegate.modResults.language !== 'swift') throw new Error(`${MARKER}: expected a Swift AppDelegate`);

    appDelegate.modResults.contents = addNoHttpCache(appDelegate.modResults.contents);

    return appDelegate;
  });
}

module.exports = withNoHttpCache;
module.exports.addNoHttpCache = addNoHttpCache;
