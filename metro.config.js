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

  // react-native-webrtc depends on event-target-shim@6; RN ships v5.
  if (
    moduleName.startsWith('event-target-shim')
    && context.originModulePath.includes(`${path.sep}react-native-webrtc${path.sep}`)
  ) {
    const eventTargetShimPath = resolveFrom(context.originModulePath, moduleName);
    return {
      filePath: eventTargetShimPath,
      type: 'sourceFile',
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
