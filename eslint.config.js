// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      '.expo/*',
      'android/*',
      'dist/*',
      'graphify-out/*',
      'ios/*',
      'node_modules/*',
    ],
  },
  {
    rules: {
      // Escaping is an HTML concern. In React Native, apostrophes and quotes
      // inside <Text> render literally and must stay unescaped.
      'react/no-unescaped-entities': 'off',
      // This codebase consistently writes Array<T>; enforcing T[] would be a
      // large mechanical diff for no behavioural gain.
      '@typescript-eslint/array-type': 'off',
    },
  },
];
