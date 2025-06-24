// tests/services/chromaVectorStore.test.js
const ChromaVectorStore = require('../../src/services/chromaVectorStore');
const config = require('../../src/config/config');

// Mock the chromadb client
const mockAdd = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();
const mockCount = jest.fn();
const mockGetOrCreateCollection = jest.fn();

jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection.mockImplementation(() => Promise.resolve({
      add: mockAdd,
      query: mockQuery,
      delete: mockDelete,
      count: mockCount.mockResolvedValue(0), // Default count to 0
    })),
  })),
}));

describe('ChromaVectorStore', () => {
  let originalChromaPath;
  let originalChromaCollectionPrefix;

  beforeAll(() => {
    originalChromaPath = config.CHROMA_PATH;
    originalChromaCollectionPrefix = config.CHROMA_COLLECTION_NAME_PREFIX;
  });

  afterAll(() => {
    config.CHROMA_PATH = originalChromaPath;
    config.CHROMA_COLLECTION_NAME_PREFIX = originalChromaCollectionPrefix;
  });

  beforeEach(() => {
    config.CHROMA_PATH = ''; // Default to in-memory for most tests
    config.CHROMA_COLLECTION_NAME_PREFIX = 'testproj-';

    jest.clearAllMocks();

    // Reset mock collection behavior for each test as needed
    mockGetOrCreateCollection.mockImplementation(({ name }) => Promise.resolve({
        name,
        add: mockAdd.mockResolvedValue({}),
        query: mockQuery.mockResolvedValue({ ids: [[]] }), // Default to empty results structure
        delete: mockDelete.mockResolvedValue({}),
        count: mockCount.mockResolvedValue(0),
    }));
  });

  test('constructor should initialize ChromaClient with path if provided', () => {
    config.CHROMA_PATH = 'http://localhost:8000';
    new ChromaVectorStore();
    expect(require('chromadb').ChromaClient).toHaveBeenCalledWith({ path: 'http://localhost:8000' });
  });

  test('constructor should initialize ChromaClient without path if not provided (in-memory/default)', () => {
    config.CHROMA_PATH = '';
    new ChromaVectorStore();
    expect(require('chromadb').ChromaClient).toHaveBeenCalledWith({});
  });

  describe('addAssetVector', () => {
    test('should add vector to the correct collection', async () => {
      const store = new ChromaVectorStore();
      const projectId = 'project1';
      const assetId = 'asset1';
      const vector = [0.1, 0.2, 0.3];

      await store.addAssetVector(projectId, assetId, vector);

      const expectedCollectionName = `testproj-project1`; // Based on prefix and sanitized ID
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith({ name: expectedCollectionName });
      expect(mockAdd).toHaveBeenCalledWith({
        ids: [assetId],
        embeddings: [vector],
        metadatas: [{ projectId, assetIdString: assetId }],
      });
    });

    test('should throw error if collection.add fails', async () => {
      const store = new ChromaVectorStore();
      mockAdd.mockRejectedValueOnce(new Error('Chroma add error'));
      await expect(store.addAssetVector('p1', 'a1', [1])).rejects.toThrow('Failed to add asset vector to Chroma: Chroma add error');
    });
  });

  describe('findSimilarAssets', () => {
    test('should query vectors and return asset IDs', async () => {
      const store = new ChromaVectorStore();
      const projectId = 'project1';
      const queryVector = [0.1, 0.2, 0.3];
      const topN = 3;
      const mockResults = { ids: [['asset1', 'asset2']] };
      mockQuery.mockResolvedValueOnce(mockResults);

      const result = await store.findSimilarAssets(projectId, queryVector, topN);

      const expectedCollectionName = `testproj-project1`;
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith({ name: expectedCollectionName });
      expect(mockQuery).toHaveBeenCalledWith({ queryEmbeddings: [queryVector], nResults: topN });
      expect(result).toEqual(['asset1', 'asset2']);
    });

    test('should return empty array if query vector is empty', async () => {
        const store = new ChromaVectorStore();
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const result = await store.findSimilarAssets('p1', []);
        expect(result).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalledWith('ChromaVectorStore: Query vector is undefined or empty.');
        consoleErrorSpy.mockRestore();
    });

    test('should handle Chroma error "exceeds number of elements" by querying for count', async () => {
        const store = new ChromaVectorStore();
        const projectId = 'projectSmall';
        const queryVector = [0.1, 0.2];
        const expectedCollectionName = `testproj-projectSmall`;

        mockCount.mockResolvedValue(1); // Collection has 1 item
        mockQuery
            .mockRejectedValueOnce(new Error("Number of requested results 5 exceeds number of elements in index 1"))
            .mockResolvedValueOnce({ ids: [['assetOnly']] }); // Result for the retry query

        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const results = await store.findSimilarAssets(projectId, queryVector, 5);

        expect(mockGetOrCreateCollection).toHaveBeenCalledWith({ name: expectedCollectionName });
        expect(mockQuery).toHaveBeenCalledTimes(2); // Initial query and retry query
        expect(mockQuery.mock.calls[0][0]).toEqual({ queryEmbeddings: [queryVector], nResults: 5 });
        expect(mockQuery.mock.calls[1][0]).toEqual({ queryEmbeddings: [queryVector], nResults: 1 });
        expect(results).toEqual(['assetOnly']);
        expect(consoleWarnSpy).toHaveBeenCalled();
        consoleWarnSpy.mockRestore();
    });

    test('should throw error if Chroma query fails (not an "exceeds elements" error)', async () => {
      const store = new ChromaVectorStore();
      mockQuery.mockRejectedValueOnce(new Error('Chroma generic query error'));
      await expect(store.findSimilarAssets('p1', [1])).rejects.toThrow('Failed to find similar assets in Chroma: Chroma generic query error');
    });
  });

  describe('removeAssetVector', () => {
    test('should delete vector by assetId', async () => {
      const store = new ChromaVectorStore();
      const projectId = 'project1';
      const assetId = 'asset1';

      await store.removeAssetVector(projectId, assetId);

      const expectedCollectionName = `testproj-project1`;
      expect(mockGetOrCreateCollection).toHaveBeenCalledWith({ name: expectedCollectionName });
      expect(mockDelete).toHaveBeenCalledWith({ ids: [assetId] });
    });

    test('should throw error if collection.delete fails', async () => {
      const store = new ChromaVectorStore();
      mockDelete.mockRejectedValueOnce(new Error('Chroma delete error'));
      await expect(store.removeAssetVector('p1', 'a1')).rejects.toThrow('Failed to remove asset vector from Chroma: Chroma delete error');
    });
  });
});
