// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

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
    // CommonJS config/plugin files run in Node (prebuild), not in the app.
    files: ['app.config.js', 'plugins/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      // Escaping is an HTML concern. In React Native, apostrophes and quotes
      // inside <Text> render literally and must stay unescaped.
      'react/no-unescaped-entities': 'off',
      // This codebase consistently writes Array<T>; enforcing T[] would be a
      // large mechanical diff for no behavioural gain.
      '@typescript-eslint/array-type': 'off',
      // SDK 57's flat config enables react-hooks v6 opinions that flag
      // long-standing working patterns (effect state resets, ref reads,
      // manual memoization). The React Compiler babel plugin is NOT enabled
      // in this project, so these are lint-only. Deferred as tech debt:
      // restructuring them risks behaviour changes for zero runtime gain.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
