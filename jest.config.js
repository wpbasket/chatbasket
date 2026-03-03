/** @type {import('jest').Config} */
module.exports = {
  // Use babel-jest directly (not jest-expo) to avoid expo runtime side-effects
  // in pure unit tests that mock all external dependencies.
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@legendapp/.*)',
  ],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globals: {
    __DEV__: true,
  },
  // Suppress noisy console.log/debug from the SUT
  silent: false,
};
