// tests/services/vectorService.test.js
let vectorService = require('../../src/services/vectorService');
const InMemoryVectorStore = require('../../src/services/inMemoryVectorStore');
let config = require('../../src/config/config');

// Mock the config to control the provider for testing
jest.mock('../../src/config/config', () => ({
  ...jest.requireActual('../../src/config/config'), // Import and retain default behavior
  VECTOR_STORE_PROVIDER: 'inMemory', // Default for most tests
}));

describe('VectorService', () => {
  // Clear any cached instance from vectorService before each test
  beforeEach(() => {
    // This is a bit of a hack to reset the singleton instance within vectorService.js
    // It requires vectorService.js to not cache vectorStoreInstance in a way that's completely hidden.
    // A more robust solution might involve exporting a reset function from vectorService.js for testing.
    // For now, we rely on the fact that getVectorStore will re-evaluate if vectorStoreInstance is falsy.
    // We can achieve this by temporarily changing the config or by directly nullifying if possible.
    // If vectorService.js was structured as a class, this would be easier.
    // For this example, we'll assume direct re-evaluation if we could reset its internal 'vectorStoreInstance'.
    // Since we can't directly access 'vectorStoreInstance' from here, we will test its behavior based on config.

    // To ensure a fresh instance for each test based on config, we can invalidate require cache for config and vectorService
    jest.resetModules(); // This will clear require cache for all modules
     // Re-require with potentially modified mock
    config = require('../../src/config/config');
    vectorService = require('../../src/services/vectorService');
  });

  describe('getVectorStore', () => {
    test('should return an instance of InMemoryVectorStore when provider is "inMemory"', () => {
      config.VECTOR_STORE_PROVIDER = 'inMemory'; // Explicitly set for clarity
      const store = vectorService.getVectorStore();
      expect(store.projectVectorStores).toBeDefined(); // Check for a property unique to InMemoryVectorStore
      expect(typeof store._euclideanDistance).toBe('function'); // Check for a method unique to InMemoryVectorStore
    });

    test('should return an instance of InMemoryVectorStore when provider is "InMemory" (case-insensitive)', () => {
      config.VECTOR_STORE_PROVIDER = 'InMemory';
      // We need to reset modules again because config is cached by vectorService when it's first required.
      jest.resetModules();
      config = require('../../src/config/config');
      config.VECTOR_STORE_PROVIDER = 'InMemory'; // Set it on the fresh config object
      vectorService = require('../../src/services/vectorService');

      const store = vectorService.getVectorStore();
      expect(store.projectVectorStores).toBeDefined();
      expect(typeof store._euclideanDistance).toBe('function');
    });

    test('should return an instance of InMemoryVectorStore when provider is not set (uses default)', () => {
      config.VECTOR_STORE_PROVIDER = undefined; // Simulate it not being in .env or config
      jest.resetModules();
      config = require('../../src/config/config');
      config.VECTOR_STORE_PROVIDER = undefined;
      vectorService = require('../../src/services/vectorService');

      const store = vectorService.getVectorStore();
      expect(store.projectVectorStores).toBeDefined();
      expect(typeof store._euclideanDistance).toBe('function');
      // Check console log to ensure default was used (optional)
    });

    test('should throw an error for an unsupported provider', () => {
      config.VECTOR_STORE_PROVIDER = 'unsupportedProvider';
      jest.resetModules();
      config = require('../../src/config/config');
      config.VECTOR_STORE_PROVIDER = 'unsupportedProvider';
      vectorService = require('../../src/services/vectorService');

      expect(() => {
        vectorService.getVectorStore();
      }).toThrow('Unsupported vector store provider: unsupportedProvider');
    });

    test('should return the same instance on subsequent calls (singleton behavior)', () => {
      config.VECTOR_STORE_PROVIDER = 'inMemory';
      jest.resetModules();
      config = require('../../src/config/config');
      config.VECTOR_STORE_PROVIDER = 'inMemory';
      vectorService = require('../../src/services/vectorService');

      const store1 = vectorService.getVectorStore();
      const store2 = vectorService.getVectorStore();
      expect(store1).toBe(store2);
    });
  });

  describe('generateEmbedding', () => {
    test('should generate a vector and tags', async () => {
      const content = 'This is a test content for embedding.';
      const { vector, tags } = await vectorService.generateEmbedding(content);

      expect(vector).toBeInstanceOf(Array);
      expect(vector.length).toBe(10); // As per current implementation
      vector.forEach(v => expect(typeof v).toBe('number'));

      expect(tags).toBeInstanceOf(Array);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(5);
      expect(tags).toEqual(['this', 'is', 'a', 'test', 'content']);
    });

    test('should handle short content for tags', async () => {
      const content = 'Short content.';
      const { tags } = await vectorService.generateEmbedding(content);
      expect(tags).toEqual(['short', 'content.']);
    });
  });

  // Test the wrapper functions to ensure they call the store's methods
  describe('Delegated methods', () => {
    let mockStoreInstance;

    beforeEach(() => {
      // Reset modules to ensure a fresh start and re-apply mocks
      jest.resetModules();
      config = require('../../src/config/config');
      config.VECTOR_STORE_PROVIDER = 'inMemory'; // Ensure InMemoryStore is the one we mock

      // Mock the InMemoryVectorStore implementation
      mockStoreInstance = {
        addAssetVector: jest.fn().mockResolvedValue(undefined),
        findSimilarAssets: jest.fn().mockResolvedValue([]),
        removeAssetVector: jest.fn().mockResolvedValue(undefined),
      };

      // Mock the InMemoryVectorStore constructor to return our mock instance
      jest.mock('../../src/services/inMemoryVectorStore', () => {
        return jest.fn().mockImplementation(() => mockStoreInstance);
      });

      vectorService = require('../../src/services/vectorService'); // Re-require after mocks
    });

    afterEach(() => {
        jest.unmock('../../src/services/inMemoryVectorStore'); // Clean up mock
    });

    test('addAssetVector should call store.addAssetVector', async () => {
      const projectId = 'p1', assetId = 'a1', vector = [1];
      await vectorService.addAssetVector(projectId, assetId, vector);
      // Get the store instance that vectorService is using
      const store = vectorService.getVectorStore();
      expect(store.addAssetVector).toHaveBeenCalledWith(projectId, assetId, vector);
    });

    test('findSimilarAssets should call store.findSimilarAssets', async () => {
      const projectId = 'p1', queryVector = [1], topN = 3;
      await vectorService.findSimilarAssets(projectId, queryVector, topN);
      const store = vectorService.getVectorStore();
      expect(store.findSimilarAssets).toHaveBeenCalledWith(projectId, queryVector, topN);
    });

    test('removeAssetVector should call store.removeAssetVector', async () => {
      const projectId = 'p1', assetId = 'a1';
      await vectorService.removeAssetVector(projectId, assetId);
      const store = vectorService.getVectorStore();
      expect(store.removeAssetVector).toHaveBeenCalledWith(projectId, assetId);
    });
  });
});
