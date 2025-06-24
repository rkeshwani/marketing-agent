// tests/services/pineconeVectorStore.test.js
const PineconeVectorStore = require('../../src/services/pineconeVectorStore');
const config = require('../../src/config/config');

// Mock the Pinecone client
const mockUpsert = jest.fn();
const mockQuery = jest.fn();
const mockDeleteMany = jest.fn();
const mockNamespace = jest.fn(() => ({
  upsert: mockUpsert,
  query: mockQuery,
  deleteMany: mockDeleteMany,
}));
const mockIndex = jest.fn(() => ({
  namespace: mockNamespace,
}));

jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: mockIndex,
  })),
}));

describe('PineconeVectorStore', () => {
  let originalApiKey;
  let originalIndexName;

  beforeAll(() => {
    originalApiKey = config.PINECONE_API_KEY;
    originalIndexName = config.PINECONE_INDEX_NAME;
  });

  afterAll(() => {
    config.PINECONE_API_KEY = originalApiKey;
    config.PINECONE_INDEX_NAME = originalIndexName;
  });

  beforeEach(() => {
    // Reset mock states and implementations before each test
    config.PINECONE_API_KEY = 'test-pinecone-key';
    config.PINECONE_INDEX_NAME = 'test-pinecone-index';
    mockUpsert.mockClear().mockResolvedValue({});
    mockQuery.mockClear().mockResolvedValue({ matches: [] });
    mockDeleteMany.mockClear().mockResolvedValue({});
    mockNamespace.mockClear().mockImplementation(() => ({ // Ensure namespace mock is reset correctly
        upsert: mockUpsert,
        query: mockQuery,
        deleteMany: mockDeleteMany,
    }));
    mockIndex.mockClear().mockImplementation(() => ({ // Ensure index mock is reset correctly
        namespace: mockNamespace,
    }));
    // Clear the Pinecone constructor mock calls too
    require('@pinecone-database/pinecone').Pinecone.mockClear();
  });

  test('constructor should throw error if API key is not configured', () => {
    config.PINECONE_API_KEY = '';
    expect(() => new PineconeVectorStore()).toThrow('Pinecone API key is not configured. Please set PINECONE_API_KEY.');
  });

  test('constructor should throw error if index name is not configured', () => {
    config.PINECONE_INDEX_NAME = '';
    expect(() => new PineconeVectorStore()).toThrow('Pinecone index name is not configured. Please set PINECONE_INDEX_NAME.');
  });

  test('constructor should initialize Pinecone client and target index', () => {
    new PineconeVectorStore();
    expect(require('@pinecone-database/pinecone').Pinecone).toHaveBeenCalledWith({ apiKey: 'test-pinecone-key' });
    expect(mockIndex).toHaveBeenCalledWith('test-pinecone-index');
  });

  describe('addAssetVector', () => {
    test('should upsert vector to the correct namespace', async () => {
      const store = new PineconeVectorStore();
      const projectId = 'project1';
      const assetId = 'asset1';
      const vector = [0.1, 0.2, 0.3];
      await store.addAssetVector(projectId, assetId, vector);
      expect(mockNamespace).toHaveBeenCalledWith(projectId);
      expect(mockUpsert).toHaveBeenCalledWith([{ id: assetId, values: vector }]);
    });

    test('should use default namespace if projectId is not provided', async () => {
      const store = new PineconeVectorStore();
      const assetId = 'asset1';
      const vector = [0.1, 0.2, 0.3];
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await store.addAssetVector(null, assetId, vector);
      expect(mockNamespace).toHaveBeenCalledWith('');
      expect(mockUpsert).toHaveBeenCalledWith([{ id: assetId, values: vector }]);
      expect(consoleWarnSpy).toHaveBeenCalledWith('PineconeVectorStore: ProjectId (namespace) is missing. Using default namespace.');
      consoleWarnSpy.mockRestore();
    });

    test('should throw error if Pinecone upsert fails', async () => {
      const store = new PineconeVectorStore();
      mockUpsert.mockRejectedValueOnce(new Error('Pinecone API error'));
      await expect(store.addAssetVector('p1', 'a1', [1])).rejects.toThrow('Failed to add asset vector to Pinecone: Pinecone API error');
    });
  });

  describe('findSimilarAssets', () => {
    test('should query vectors from the correct namespace and return asset IDs', async () => {
      const store = new PineconeVectorStore();
      const projectId = 'project1';
      const queryVector = [0.1, 0.2, 0.3];
      const topN = 3;
      const mockMatches = [{ id: 'asset1' }, { id: 'asset2' }];
      mockQuery.mockResolvedValueOnce({ matches: mockMatches });

      const result = await store.findSimilarAssets(projectId, queryVector, topN);
      expect(mockNamespace).toHaveBeenCalledWith(projectId);
      expect(mockQuery).toHaveBeenCalledWith({ vector: queryVector, topK: topN });
      expect(result).toEqual(['asset1', 'asset2']);
    });

    test('should use default namespace for findSimilarAssets if projectId is missing', async () => {
        const store = new PineconeVectorStore();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await store.findSimilarAssets(null, [0.1, 0.2]);
        expect(mockNamespace).toHaveBeenCalledWith('');
        expect(consoleWarnSpy).toHaveBeenCalledWith('PineconeVectorStore: ProjectId (namespace) is missing for findSimilarAssets. Using default namespace.');
        consoleWarnSpy.mockRestore();
    });

    test('should return empty array if query vector is empty or undefined', async () => {
        const store = new PineconeVectorStore();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let result = await store.findSimilarAssets('p1', []);
        expect(result).toEqual([]);
        result = await store.findSimilarAssets('p1', undefined);
        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('PineconeVectorStore: Query vector is undefined or empty.');
        consoleErrorSpy.mockRestore();
    });

    test('should throw error if Pinecone query fails', async () => {
      const store = new PineconeVectorStore();
      mockQuery.mockRejectedValueOnce(new Error('Pinecone query API error'));
      await expect(store.findSimilarAssets('p1', [1])).rejects.toThrow('Failed to find similar assets in Pinecone: Pinecone query API error');
    });
  });

  describe('removeAssetVector', () => {
    test('should delete vector from the correct namespace', async () => {
      const store = new PineconeVectorStore();
      const projectId = 'project1';
      const assetId = 'asset1';
      await store.removeAssetVector(projectId, assetId);
      expect(mockNamespace).toHaveBeenCalledWith(projectId);
      expect(mockDeleteMany).toHaveBeenCalledWith([assetId]);
    });

    test('should use default namespace for removeAssetVector if projectId is missing', async () => {
        const store = new PineconeVectorStore();
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await store.removeAssetVector(null, 'a1');
        expect(mockNamespace).toHaveBeenCalledWith('');
        expect(consoleWarnSpy).toHaveBeenCalledWith('PineconeVectorStore: ProjectId (namespace) is missing for removeAssetVector. Using default namespace.');
        consoleWarnSpy.mockRestore();
    });

    test('should throw error if Pinecone delete fails', async () => {
      const store = new PineconeVectorStore();
      mockDeleteMany.mockRejectedValueOnce(new Error('Pinecone delete API error'));
      await expect(store.removeAssetVector('p1', 'a1')).rejects.toThrow('Failed to remove asset vector from Pinecone: Pinecone delete API error');
    });
  });
});
