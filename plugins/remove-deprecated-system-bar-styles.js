const {
  AndroidConfig,
  withAndroidStyles,
} = require('@expo/config-plugins');

const APP_THEME = AndroidConfig.Styles.getAppThemeGroup();
const DEPRECATED_SYSTEM_BAR_STYLE_ITEMS = [
  'android:statusBarColor',
  'android:navigationBarColor',
  'android:enforceStatusBarContrast',
  'android:enforceNavigationBarContrast',
];

module.exports = function removeDeprecatedSystemBarStyles(config) {
  return withAndroidStyles(config, (configWithStyles) => {
    DEPRECATED_SYSTEM_BAR_STYLE_ITEMS.forEach((name) => {
      configWithStyles.modResults = AndroidConfig.Styles.removeStylesItem({
        xml: configWithStyles.modResults,
        parent: APP_THEME,
        name,
      });
    });

    return configWithStyles;
  });
};
