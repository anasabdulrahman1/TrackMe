module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['babel.config.js', '.eslintrc.js', 'index.js'],
  parserOptions: {
    requireConfigFile: false,
  },
  rules: {
    'react/no-unstable-nested-components': ['warn', { allowAsProps: true }],
  },
};