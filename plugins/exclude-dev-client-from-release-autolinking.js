const { withSettingsGradle } = require('@expo/config-plugins');

const DEV_CLIENT_MODULES = [
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
  'expo-dev-menu-interface',
];

function isDevClientBuild() {
  return (
    process.env.EAS_BUILD_PROFILE === 'development' ||
    process.env.EXPO_DEV_CLIENT === '1'
  );
}

function formatGroovyList(values) {
  return `[${values.map((value) => `"${value}"`).join(', ')}]`;
}

function applyDevClientExclude(settingsGradle) {
  const assignment = `expoAutolinking {\n  exclude = ${formatGroovyList(DEV_CLIENT_MODULES)}\n}`;

  if (settingsGradle.includes('expoAutolinking.exclude =')) {
    return settingsGradle.replace(
      /expoAutolinking\.exclude\s*=\s*\[[^\]]*\]\n?/,
      assignment + '\n',
    );
  }

  if (settingsGradle.includes('expoAutolinking {')) {
    return settingsGradle.replace(
      /expoAutolinking\s*\{[\s\S]*?\}\n?/,
      assignment,
    );
  }

  const reactSettingsBlock = 'extensions.configure(com.facebook.react.ReactSettingsExtension)';
  if (settingsGradle.includes(reactSettingsBlock)) {
    return settingsGradle.replace(reactSettingsBlock, `${assignment}\n${reactSettingsBlock}`);
  }

  return settingsGradle.replace('expoAutolinking.useExpoModules()', `${assignment}\nexpoAutolinking.useExpoModules()`);
}

module.exports = function excludeDevClientFromReleaseAutolinking(config) {
  if (isDevClientBuild()) {
    return config;
  }

  return withSettingsGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== 'groovy') {
      return configWithGradle;
    }

    configWithGradle.modResults.contents = applyDevClientExclude(
      configWithGradle.modResults.contents,
    );

    return configWithGradle;
  });
};
