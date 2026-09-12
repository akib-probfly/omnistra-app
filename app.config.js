const fs = require('fs');
const path = require('path');

const appJson = require('./app.json');

const googleServicesFile = path.join(__dirname, 'google-services.json');
const expo = { ...appJson.expo };

if (fs.existsSync(googleServicesFile)) {
  expo.android = {
    ...expo.android,
    googleServicesFile: './google-services.json',
  };
}

// Play Console flags builds with <25% DEX optimization ("Obfuscation 1%").
// expo-dev-client injects large unoptimized/debug DEX code, so it must never
// ship in store builds. Only the EAS `development` profile keeps it.
const buildProfile = process.env.EAS_BUILD_PROFILE;
const isDevClientBuild =
  buildProfile === 'development' || process.env.EXPO_DEV_CLIENT === '1';

if (!isDevClientBuild && Array.isArray(expo.plugins)) {
  expo.plugins = expo.plugins.filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'expo-dev-client';
  });

  expo.autolinking = {
    ...(expo.autolinking || {}),
    exclude: [
      ...new Set([
        ...((expo.autolinking && expo.autolinking.exclude) || []),
        'expo-dev-client',
        'expo-dev-launcher',
        'expo-dev-menu',
        'expo-dev-menu-interface',
      ]),
    ],
  };

  // The network inspector wires dev-only interception code into the native
  // build (EX_DEV_CLIENT_NETWORK_INSPECTOR=true). Keep it for dev builds,
  // drop it from store builds so every DEX byte can be shrunk/obfuscated.
  expo.plugins = expo.plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      const props = plugin[1] || {};
      return [
        plugin[0],
        {
          ...props,
          android: { ...props.android, networkInspector: false },
          ios: { ...(props.ios || {}), networkInspector: false },
        },
      ];
    }
    return plugin;
  });
}

module.exports = expo;
