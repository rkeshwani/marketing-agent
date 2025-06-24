// tests/services/weaviateVectorStore.test.js
const WeaviateVectorStore = require('../../src/services/weaviateVectorStore');
const config = require('../../src/config/config');

// Mock the weaviate-ts-client
const mockClassGetter = jest.fn();
const mockClassCreator = jest.fn();
const mockDataCreator = jest.fn();
const mockDataDeleter = jest.fn();
const mockGraphqlGet = jest.fn();

const mockWeaviateClient = {
  schema: {
    classGetter: jest.fn(() => ({
      withClassName: mockClassGetter,
      do: mockClassGetter.mockReturnValue(Promise.resolve({ class: 'TestClass', vectorizer: 'none' })), // Default to class existing
    })),
    classCreator: jest.fn(() => ({
      withClass: mockClassCreator,
      do: mockClassCreator.mockReturnValue(Promise.resolve({})),
    })),
  },
  data: {
    creator: jest.fn(() => ({
      withClassName: jest.fn().mockReturnThis(),
      withProperties: jest.fn().mockReturnThis(),
      withVector: jest.fn().mockReturnThis(),
      withId: jest.fn().mockReturnThis(), // For completeness, though not directly used in add for new objects by ID
      do: mockDataCreator.mockReturnValue(Promise.resolve({})),
    })),
    deleter: jest.fn(() => ({
      withClassName: jest.fn().mockReturnThis(),
      withId: mockDataDeleter,
      do: mockDataDeleter.mockReturnValue(Promise.resolve({})),
    })),
  },
  graphql: {
    get: jest.fn(() => ({
      withClassName: jest.fn().mockReturnThis(),
      withFields: jest.fn().mockReturnThis(),
      withNearVector: jest.fn().mockReturnThis(),
      withWhere: jest.fn().mockReturnThis(),
      withLimit: jest.fn().mockReturnThis(),
      do: mockGraphqlGet.mockReturnValue(Promise.resolve({ data: { Get: {} } })),
    })),
  },
};

jest.mock('weaviate-ts-client', () => ({
  client: jest.fn(() => mockWeaviateClient),
  ApiKey: jest.fn(apiKey => ({ type: 'apiKey', value: apiKey })), // Mock ApiKey constructor
}));


describe('WeaviateVectorStore', () => {
  let originalWeaviateConfig;

  beforeAll(() => {
    originalWeaviateConfig = {
      WEAVIATE_SCHEME: config.WEAVIATE_SCHEME,
      WEAVIATE_HOST: config.WEAVIATE_HOST,
      WEAVIATE_API_KEY: config.WEAVIATE_API_KEY,
      WEAVIATE_CLASS_NAME_PREFIX: config.WEAVIATE_CLASS_NAME_PREFIX,
    };
  });

  afterAll(() => {
    config.WEAVIATE_SCHEME = originalWeaviateConfig.WEAVIATE_SCHEME;
    config.WEAVIATE_HOST = originalWeaviateConfig.WEAVIATE_HOST;
    config.WEAVIATE_API_KEY = originalWeaviateConfig.WEAVIATE_API_KEY;
    config.WEAVIATE_CLASS_NAME_PREFIX = originalWeaviateConfig.WEAVIATE_CLASS_NAME_PREFIX;
  });

  beforeEach(() => {
    config.WEAVIATE_SCHEME = 'http';
    config.WEAVIATE_HOST = 'localhost:8080';
    config.WEAVIATE_API_KEY = 'test-weaviate-key'; // Ensure API key is set for tests that might use it
    config.WEAVIATE_CLASS_NAME_PREFIX = 'TestProjectAsset';

    // Reset all mock implementations and call history
    jest.clearAllMocks();

    // Default behavior for mocks that might be called in constructor or helper
    mockClassGetter.mockImplementation(() => ({ do: () => Promise.resolve({ class: 'ExistingClass', vectorizer: 'none' }) }));
    mockGraphqlGet.mockImplementation(() => Promise.resolve({ data: { Get: { ['TestProjectAssetproject1']: [] } } }));
  });

  test('constructor should initialize Weaviate client with scheme, host and API key', () => {
    new WeaviateVectorStore();
    expect(require('weaviate-ts-client').client).toHaveBeenCalledWith({
      scheme: 'http',
      host: 'localhost:8080',
      apiKey: { type: 'apiKey', value: 'test-weaviate-key' },
    });
  });

  test('constructor should initialize Weaviate client without API key if not provided', () => {
    config.WEAVIATE_API_KEY = '';
    new WeaviateVectorStore();
    expect(require('weaviate-ts-client').client).toHaveBeenCalledWith({
      scheme: 'http',
      host: 'localhost:8080',
    });
  });

  describe('_ensureClassExists', () => {
    test('should create class if it does not exist', async () => {
      mockClassGetter.mockImplementationOnce(() => ({ do: () => Promise.reject(new Error("class not found")) }));
      mockClassCreator.mockReturnValueOnce(Promise.resolve({})); // Mock the final .do() of classCreator chain

      const store = new WeaviateVectorStore();
      await store._ensureClassExists('project1');

      const expectedClassName = 'TestProjectAssetproject1';
      expect(mockClassCreator).toHaveBeenCalledWith(expect.objectContaining({ class: expectedClassName, vectorizer: 'none' }));
    });

    test('should not try to create class if it exists', async () => {
        mockClassGetter.mockImplementationOnce(() => ({ do: () => Promise.resolve({ class: 'TestProjectAssetproject1', vectorizer: 'none' }) }));
        const store = new WeaviateVectorStore();
        await store._ensureClassExists('project1');
        expect(mockClassCreator).not.toHaveBeenCalled();
    });
  });

  describe('addAssetVector', () => {
    test('should create object if assetId does not exist', async () => {
      const store = new WeaviateVectorStore();
      // Ensure _getWeaviateUUID returns null (asset not found)
      mockGraphqlGet.mockResolvedValueOnce({ data: { Get: { ['TestProjectAssetproject1']: [] } } });
      mockDataCreator.mockResolvedValueOnce({}); // Mock the final .do() of creator chain

      await store.addAssetVector('project1', 'assetNew', [0.7, 0.8, 0.9]);
      expect(mockDataCreator).toHaveBeenCalled();
    });

    test('should delete and re-create object if assetId exists (to update vector)', async () => {
        const store = new WeaviateVectorStore();
        const projectId = 'project1';
        const assetId = 'assetExisting';
        const className = 'TestProjectAssetproject1';
        const existingUUID = 'some-weaviate-uuid';

        // Mock _getWeaviateUUID to return an existing UUID
        mockGraphqlGet.mockImplementation((args) => { // Make it more flexible
            if (mockGraphqlGet.mock.calls.length <= 1) { // First call for _getWeaviateUUID
                 return Promise.resolve({ data: { Get: { [className]: [{ _additional: { id: existingUUID } }] } } });
            }
            return Promise.resolve({ data: { Get: { [className]: [] } } }); // Subsequent calls
        });
        mockDataDeleter.mockImplementation(() => ({ do: () => Promise.resolve({}) })); // Mock the final .do() of deleter chain
        mockDataCreator.mockResolvedValueOnce({}); // Mock the final .do() of creator chain

        await store.addAssetVector(projectId, assetId, [0.1, 0.2, 0.3]);

        expect(mockDataDeleter).toHaveBeenCalledWith(existingUUID);
        expect(mockDataCreator).toHaveBeenCalled(); // Called to re-create the object
      });
  });

  describe('findSimilarAssets', () => {
    test('should query Weaviate and return asset IDs', async () => {
      const store = new WeaviateVectorStore();
      const projectId = 'projectSearch';
      const className = 'TestProjectAssetprojectSearch';
      const queryVector = [0.1, 0.2, 0.3];
      const mockResponse = {
        data: { Get: { [className]: [{ assetId: 'asset1' }, { assetId: 'asset2' }] } },
      };
      mockGraphqlGet.mockResolvedValueOnce(mockResponse);

      const results = await store.findSimilarAssets(projectId, queryVector, 2);
      expect(mockGraphqlGet).toHaveBeenCalled();
      expect(results).toEqual(['asset1', 'asset2']);
    });

    test('should return empty array if class does not exist during query', async () => {
        const store = new WeaviateVectorStore();
        mockGraphqlGet.mockRejectedValueOnce(new Error(" reconhecimento: class 'NonExistentClass' does not exist"));
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const results = await store.findSimilarAssets('NonExistentProject', [0.1, 0.2]);
        expect(results).toEqual([]);
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Weaviate class TestProjectAssetNonExistentProject does not exist"));
        consoleWarnSpy.mockRestore();
    });
  });

  describe('removeAssetVector', () => {
    test('should delete object by Weaviate UUID if assetId is found', async () => {
      const store = new WeaviateVectorStore();
      const projectId = 'projectRemove';
      const assetId = 'assetToRemove';
      const className = 'TestProjectAssetprojectRemove';
      const weaviateUUID = 'uuid-to-delete';

      mockGraphqlGet.mockResolvedValueOnce({ data: { Get: { [className]: [{ _additional: { id: weaviateUUID } }] } } });
      mockDataDeleter.mockImplementation(() => ({ do: () => Promise.resolve({}) }));

      await store.removeAssetVector(projectId, assetId);
      expect(mockDataDeleter).toHaveBeenCalledWith(weaviateUUID);
    });

    test('should not attempt delete if assetId is not found', async () => {
        const store = new WeaviateVectorStore();
        const projectId = 'projectNoRemove';
        const assetId = 'assetNotFound';
        const className = 'TestProjectAssetprojectNoRemove';

        mockGraphqlGet.mockResolvedValueOnce({ data: { Get: { [className]: [] } } });
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        await store.removeAssetVector(projectId, assetId);
        expect(mockDataDeleter).not.toHaveBeenCalled();
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`Asset ${assetId} not found in class ${className}. Nothing to delete.`));
        consoleLogSpy.mockRestore();
      });
  });
});
