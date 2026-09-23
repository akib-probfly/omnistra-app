const { withAppBuildGradle, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const OPTIMIZED_PROGUARD = 'proguard-android-optimize.txt';
const LEGACY_PROGUARD = 'proguard-android.txt';

function upsertProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
    return;
  }
  properties.push({ type: 'property', key, value });
}

function useOptimizedProguardFile(contents) {
  return contents.replace(
    /getDefaultProguardFile\(["']proguard-android\.txt["']\)/g,
    `getDefaultProguardFile("${OPTIMIZED_PROGUARD}")`,
  );
}

const ZURVIS_PROGUARD_RULES = `
# Keep the native bridge + media/network stacks stable while R8 obfuscates the rest.
# NOTE: no -dontshrink/-dontoptimize here on purpose. Those flags disable R8
# entirely and keep Play's "DEX optimization / Obfuscation" score near 0%.
# Obfuscation still applies to everything not listed in a -keep rule below.
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
# Expo core (JNI bridge + modules registry must survive obfuscation).
-keep class expo.modules.core.** { *; }
-keep class expo.modules.adapters.react.** { *; }
-keep class expo.modules.kotlin.** { *; }
# Authenticated media rendering goes through these native stacks with
# Authorization headers, so they must not be renamed/stripped by R8.
# expo-image (Coil3) + fresco webp/gif support enabled via gradle.properties.
-keep class expo.modules.image.** { *; }
-keep class coil3.** { *; }
-keep class coil.** { *; }
-keep class com.facebook.fresco.** { *; }
-keep class com.facebook.imagepipeline.** { *; }
-keep class com.facebook.drawee.** { *; }
-keep class com.bumptech.glide.** { *; }
# expo-audio / expo-video (Media3 / ExoPlayer streaming with headers).
-keep class expo.modules.audio.** { *; }
-keep class expo.modules.video.** { *; }
-keep class androidx.media3.** { *; }
-keep class com.google.android.exoplayer2.** { *; }
# expo-file-system / sharing / SecureStore download + save flows.
-keep class expo.modules.filesystem.** { *; }
-keep class expo.modules.securestore.** { *; }
-keep class expo.modules.sharing.** { *; }
-keep class expo.modules.medialibrary.** { *; }
# Network layer carrying the Bearer token (OkHttp/Okio ship consumer rules,
# but an explicit keep makes authenticated fetches robust under R8).
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-keep class com.facebook.react.modules.network.** { *; }
-dontwarn coil3.PlatformContext
`;

module.exports = function enableR8Optimization(config) {
  config = withGradleProperties(config, (configWithProperties) => {
    upsertProperty(configWithProperties.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    upsertProperty(configWithProperties.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'false');
    upsertProperty(configWithProperties.modResults, 'android.r8.optimizedResourceShrinking', 'false');
    return configWithProperties;
  });

  config = withAppBuildGradle(config, (configWithBuildGradle) => {
    if (configWithBuildGradle.modResults.language !== 'groovy') return configWithBuildGradle;
    if (!configWithBuildGradle.modResults.contents.includes(LEGACY_PROGUARD)) return configWithBuildGradle;

    configWithBuildGradle.modResults.contents = useOptimizedProguardFile(configWithBuildGradle.modResults.contents);
    return configWithBuildGradle;
  });

  return withDangerousMod(config, ['android', async (configWithDangerousMod) => {
    const rulesPath = path.join(configWithDangerousMod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    const current = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
    const withoutPrevious = current.replace(/\n# BEGIN zurvis-r8-compatibility[\s\S]*?# END zurvis-r8-compatibility\n?/g, '\n');
    fs.writeFileSync(rulesPath, `${withoutPrevious.trimEnd()}\n\n# BEGIN zurvis-r8-compatibility\n${ZURVIS_PROGUARD_RULES.trim()}\n# END zurvis-r8-compatibility\n`, 'utf8');
    return configWithDangerousMod;
  }]);
};
