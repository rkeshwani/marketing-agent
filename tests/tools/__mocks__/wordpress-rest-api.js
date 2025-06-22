// tests/tools/__mocks__/wordpress-rest-api.js

const mockWpApiInstance = {
    posts: jest.fn().mockReturnThis(),
    create: jest.fn(),
    id: jest.fn().mockReturnThis(),
    update: jest.fn(),
    // Add any other methods that your code under test might call on the WPAPI instance
};

// The default export of the 'wordpress-rest-api' module is a constructor.
// So, the mock should be a jest.fn() that returns our mock instance.
const mockWPAPIConstructor = jest.fn(() => mockWpApiInstance);

// You might also need to mock any static methods or properties if your code uses them
// e.g., mockWPAPIConstructor.someStaticMethod = jest.fn();

// To allow resetting calls and implementations for the instance methods between tests,
// you can re-export the instance so tests can access it.
// However, it's often cleaner to manage this within the test file's beforeEach.
// For now, this basic mock should suffice.
mockWPAPIConstructor.mockInstance = mockWpApiInstance;


module.exports = mockWPAPIConstructor;
