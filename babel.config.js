module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@legendapp/state/babel',
      // other plugins
      ['react-native-unistyles/plugin',{root: 'app',}]

    ]
  };
};
