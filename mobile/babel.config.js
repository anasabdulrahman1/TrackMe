module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // ADD THIS PLUGINS ARRAY
  plugins: [
    'react-native-dotenv',
  ],
  env: {
    production: {
      plugins: ['react-native-paper/babel'],
    },
  },
};