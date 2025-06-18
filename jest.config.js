// jest.config.js
module.exports = {
    testEnvironment: 'node',
    verbose: true,
    transform: {
      '^.+\\.js$': 'babel-jest', // Use babel-jest for .js files
    },
    transformIgnorePatterns: [
      '/node_modules/(?!axios)/', // Allow axios to be transformed
    ],
};
