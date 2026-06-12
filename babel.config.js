// Jest-only (env.test): rewrite `import(x)` → `Promise.resolve(require(x))`.
// The jest CJS VM cannot execute native dynamic import (needs
// --experimental-vm-modules), which breaks code like the lazy
// `await import('expo-file-system')` in the E2EE media pipeline.
// Metro dev/prod builds never use this transform.
const dynamicImportToRequire = ({ types: t }) => ({
  name: 'jest-dynamic-import-to-require',
  visitor: {
    CallExpression(path) {
      if (path.node.callee.type === 'Import') {
        path.replaceWith(
          t.callExpression(
            t.memberExpression(t.identifier('Promise'), t.identifier('resolve')),
            [t.callExpression(t.identifier('require'), path.node.arguments)]
          )
        );
      }
    },
  },
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@legendapp/state/babel',
      // other plugins
      ['react-native-unistyles/plugin', { root: 'src', }],
      'react-native-reanimated/plugin',
    ],
    env: {
      test: {
        plugins: [dynamicImportToRequire],
      },
    },
  };
};
