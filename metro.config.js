const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const resolveFrom = require('resolve-from');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;
const webrtcStubPath = path.resolve(__dirname, 'src/native/webrtc-stub.tsx');
const webrtcFacadePath = path.resolve(__dirname, 'src/native/webrtc.ts');

// Expo Go cannot load native WebRTC. Prefer the stub whenever `--go` is used.
const forceWebRtcStub =
  process.env.EXPO_USE_WEBRTC_STUB === '1'
  || process.argv.includes('--go');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Expo Go: never touch the real native package.
  if (forceWebRtcStub && (moduleName === 'react-native-webrtc' || moduleName.startsWith('react-native-webrtc/'))) {
    return {
      filePath: webrtcStubPath,
      type: 'sourceFile',
    };
  }

  // Dev client / custom builds: bare import goes through the facade.
  // Subpath imports (lib/commonjs/...) resolve to the real package.
  if (moduleName === 'react-native-webrtc') {
    return {
      filePath: webrtcFacadePath,
      type: 'sourceFile',
    };
  }

  // react-native-webrtc depends on event-target-shim@6 and imports
  // "event-target-shim/index", but v6's package exports only expose "." / "./es5".
  // Force-resolve to the nested v6 files so Metro doesn't hit the exports error
  // (and doesn't pick RN's event-target-shim@5).
  if (
    (moduleName === 'event-target-shim'
      || moduleName === 'event-target-shim/index'
      || moduleName === 'event-target-shim/es5')
    && context.originModulePath.includes(`${path.sep}react-native-webrtc${path.sep}`)
  ) {
    let shimRoot;
    try {
      shimRoot = path.dirname(resolveFrom(context.originModulePath, 'event-target-shim/package.json'));
    } catch {
      shimRoot = path.resolve(
        __dirname,
        'node_modules',
        'react-native-webrtc',
        'node_modules',
        'event-target-shim',
      );
    }
    const fileName = moduleName.endsWith('/es5') ? 'es5.js' : 'index.js';
    return {
      filePath: path.join(shimRoot, fileName),
      type: 'sourceFile',
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
