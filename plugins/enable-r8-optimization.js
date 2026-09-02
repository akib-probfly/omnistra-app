const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

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

module.exports = function enableR8Optimization(config) {
  config = withGradleProperties(config, (configWithProperties) => {
    upsertProperty(configWithProperties.modResults, 'android.enableMinifyInReleaseBuilds', 'true');
    upsertProperty(configWithProperties.modResults, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    upsertProperty(configWithProperties.modResults, 'android.r8.optimizedResourceShrinking', 'true');
    return configWithProperties;
  });

  return withAppBuildGradle(config, (configWithBuildGradle) => {
    if (configWithBuildGradle.modResults.language !== 'groovy') return configWithBuildGradle;
    if (!configWithBuildGradle.modResults.contents.includes(LEGACY_PROGUARD)) return configWithBuildGradle;

    configWithBuildGradle.modResults.contents = useOptimizedProguardFile(configWithBuildGradle.modResults.contents);
    return configWithBuildGradle;
  });
};
