// tests/services/faissVectorStore.test.js
const FaissVectorStore = require('../../src/services/faissVectorStore');
const config = require('../../src/config/config');
const fs = require('fs/promises');
const path = require('path');

// Mock faiss-node
const mockFaissAdd = jest.fn();
const mockFaissSearch = jest.fn();
const mockFaissWrite = jest.fn();
const mockFaissRead = jest.fn();
const mockFaissRemoveIds = jest.fn();
const mockFaissNtotal = jest.fn(() => 0); // Default to 0 items
const mockFaissGetDimension = jest.fn(() => 10); // Default to dimension 10

const mockIndexInstance = {
  add: mockFaissAdd,
  search: mockFaissSearch,
  write: mockFaissWrite,
  removeIds: mockFaissRemoveIds,
  ntotal: mockFaissNtotal,
  getDimension: mockFaissGetDimension,
};

jest.mock('faiss-node', () => ({
  IndexFlatL2: jest.fn().mockImplementation(() => mockIndexInstance),
  Index: { // Assuming Index.read or similar static methods might be used if IndexFlatL2.read is not static
    read: jest.fn().mockImplementation(() => mockIndexInstance)
  },
  MetricType: { METRIC_L2: 0 } // Mock MetricType if needed
}));
IndexFlatL2.read = jest.fn(() => mockIndexInstance); // Mock static read method


// Mock fs/promises
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'), // Import and retain default behavior
  access: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));


describe('FaissVectorStore', () => {
  let originalFaissPath;
  let originalFaissDimension;

  beforeAll(() => {
    originalFaissPath = config.FAISS_INDEX_PATH;
    originalFaissDimension = config.FAISS_DEFAULT_DIMENSION;
  });

  afterAll(() => {
    config.FAISS_INDEX_PATH = originalFaissPath;
    config.FAISS_DEFAULT_DIMENSION = originalFaissDimension;
  });

  beforeEach(() => {
    config.FAISS_INDEX_PATH = './test_faiss_indices';
    config.FAISS_DEFAULT_DIMENSION = 3; // Use a small, consistent dimension for tests

    jest.clearAllMocks();

    // Reset specific mock implementations for faiss-node related mocks
    mockFaissGetDimension.mockReturnValue(config.FAISS_DEFAULT_DIMENSION);
    mockFaissNtotal.mockReturnValue(0);
    mockFaissAdd.mockClear();
    mockFaissSearch.mockClear().mockReturnValue({ labels: [], distances: [] });
    mockFaissWrite.mockClear();
    mockFaissRead.mockClear().mockReturnValue(mockIndexInstance); // Ensure read returns the mock instance
    IndexFlatL2.read.mockClear().mockReturnValue(mockIndexInstance);
    mockFaissRemoveIds.mockClear().mockReturnValue(1); // Assume 1 item removed by default

    // Default fs mocks
    fs.access.mockImplementation(filePath => {
      // Simulate file not existing by throwing an error with code ENOENT
      const error = new Error('File not found');
      error.code = 'ENOENT';
      return Promise.reject(error);
    });
    fs.readFile.mockRejectedValue(new Error('File not found')); // Default to file not found
  });

  test('constructor should initialize with config path and dimension', () => {
    new FaissVectorStore();
    expect(config.FAISS_INDEX_PATH).toBe('./test_faiss_indices');
    expect(config.FAISS_DEFAULT_DIMENSION).toBe(3);
    expect(fs.mkdir).toHaveBeenCalledWith(config.FAISS_INDEX_PATH, { recursive: true });
  });

  describe('_loadProjectData', () => {
    test('should create new index and mapping if files do not exist', async () => {
      const store = new FaissVectorStore();
      const projectId = 'newProject';
      await store._loadProjectData(projectId);

      expect(require('faiss-node').IndexFlatL2).toHaveBeenCalledWith(config.FAISS_DEFAULT_DIMENSION);
      expect(store.projectIndices[projectId].idToFaissLabel).toEqual({});
      expect(store.projectIndices[projectId].nextFaissLabel).toBe(0);
    });

    test('should load existing index and mapping if files exist', async () => {
        const store = new FaissVectorStore();
        const projectId = 'existingProject';
        const { indexFile, mappingFile } = store._getProjectFilePaths(projectId);

        const mockMapping = { idToFaissLabel: { 'asset1': 0 }, faissLabelToId: { '0': 'asset1' }, nextFaissLabel: 1 };
        fs.access.mockImplementation(file => (file === indexFile || file === mappingFile) ? Promise.resolve() : Promise.reject(new Error('ENOENT')));
        IndexFlatL2.read.mockReturnValueOnce(mockIndexInstance);
        mockFaissNtotal.mockReturnValueOnce(1); // Index has one item
        fs.readFile.mockResolvedValueOnce(JSON.stringify(mockMapping));
        mockFaissGetDimension.mockReturnValue(config.FAISS_DEFAULT_DIMENSION);


        await store._loadProjectData(projectId);

        expect(IndexFlatL2.read).toHaveBeenCalledWith(indexFile);
        expect(fs.readFile).toHaveBeenCalledWith(mappingFile, 'utf8');
        expect(store.projectIndices[projectId].idToFaissLabel).toEqual(mockMapping.idToFaissLabel);
        expect(store.projectIndices[projectId].nextFaissLabel).toBe(mockMapping.nextFaissLabel);
    });
  });

  describe('addAssetVector', () => {
    test('should add a new vector and update mapping', async () => {
      const store = new FaissVectorStore();
      const projectId = 'projectAdd';
      const assetId = 'asset1';
      const vector = [1, 2, 3];

      // Simulate no existing index or mapping
      fs.access.mockRejectedValue({ code: 'ENOENT' });
      mockFaissNtotal.mockReturnValue(0); // Index is empty initially

      await store.addAssetVector(projectId, assetId, vector);

      expect(mockFaissAdd).toHaveBeenCalledWith(vector);
      const projectData = store.projectIndices[projectId];
      expect(projectData.idToFaissLabel[assetId]).toBe(0); // First item gets label 0
      expect(projectData.faissLabelToId[0]).toBe(assetId);
      expect(projectData.nextFaissLabel).toBe(1);
      expect(mockFaissWrite).toHaveBeenCalled(); // Ensure data is saved
      expect(fs.writeFile).toHaveBeenCalled();
    });

    test('should remove existing vector if assetId already exists, then add new', async () => {
        const store = new FaissVectorStore();
        const projectId = 'projectUpdate';
        const assetId = 'asset1';
        const oldVector = [0.1, 0.2, 0.3];
        const newVector = [0.4, 0.5, 0.6];
        const existingFaissLabel = 0;

        // Setup: loadProjectData finds existing index and mapping
        const { indexFile, mappingFile } = store._getProjectFilePaths(projectId);
        fs.access.mockImplementation(file => (file === indexFile || file === mappingFile) ? Promise.resolve() : Promise.reject(new Error('ENOENT')));
        IndexFlatL2.read.mockReturnValue(mockIndexInstance);
        mockFaissNtotal.mockReturnValue(1); // Index has one item
        mockFaissGetDimension.mockReturnValue(config.FAISS_DEFAULT_DIMENSION);
        fs.readFile.mockResolvedValue(JSON.stringify({
            idToFaissLabel: { [assetId]: existingFaissLabel },
            faissLabelToId: { [existingFaissLabel]: assetId },
            nextFaissLabel: 1
        }));

        await store.addAssetVector(projectId, assetId, newVector);

        expect(mockFaissRemoveIds).toHaveBeenCalledWith([existingFaissLabel]);
        expect(mockFaissAdd).toHaveBeenCalledWith(newVector);

        const projectData = store.projectIndices[projectId];
        // The new vector gets the *next* available FAISS label according to our simple incrementing logic
        expect(projectData.idToFaissLabel[assetId]).toBe(1);
        expect(projectData.faissLabelToId[1]).toBe(assetId);
        expect(projectData.faissLabelToId[existingFaissLabel]).toBeUndefined(); // Old label mapping removed
        expect(projectData.nextFaissLabel).toBe(2);

        expect(mockFaissWrite).toHaveBeenCalled();
        expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('findSimilarAssets', () => {
    test('should query FAISS and map labels to assetIds', async () => {
      const store = new FaissVectorStore();
      const projectId = 'projectQuery';
      const queryVector = [1, 1, 1];

      // Setup: loadProjectData
      const { indexFile, mappingFile } = store._getProjectFilePaths(projectId);
      fs.access.mockImplementation(file => (file === indexFile || file === mappingFile) ? Promise.resolve() : Promise.reject(new Error('ENOENT')));
      IndexFlatL2.read.mockReturnValue(mockIndexInstance);
      mockFaissNtotal.mockReturnValue(2); // Index has two items
      mockFaissGetDimension.mockReturnValue(config.FAISS_DEFAULT_DIMENSION);
      fs.readFile.mockResolvedValue(JSON.stringify({
          idToFaissLabel: { 'assetA': 0, 'assetB': 1 },
          faissLabelToId: { '0': 'assetA', '1': 'assetB' },
          nextFaissLabel: 2
      }));

      mockFaissSearch.mockReturnValue({ labels: [1, 0], distances: [0.5, 0.8] });

      const results = await store.findSimilarAssets(projectId, queryVector, 2);
      expect(mockFaissSearch).toHaveBeenCalledWith(queryVector, 2);
      expect(results).toEqual(['assetB', 'assetA']);
    });
  });

  describe('removeAssetVector', () => {
    test('should remove vector and update mapping', async () => {
      const store = new FaissVectorStore();
      const projectId = 'projectRemove';
      const assetId = 'assetToRemove';
      const faissLabelToRemove = 0;

      // Setup: loadProjectData
      const { indexFile, mappingFile } = store._getProjectFilePaths(projectId);
      fs.access.mockImplementation(file => (file === indexFile || file === mappingFile) ? Promise.resolve() : Promise.reject(new Error('ENOENT')));
      IndexFlatL2.read.mockReturnValue(mockIndexInstance);
      mockFaissNtotal.mockReturnValue(1);
      mockFaissGetDimension.mockReturnValue(config.FAISS_DEFAULT_DIMENSION);
      fs.readFile.mockResolvedValue(JSON.stringify({
          idToFaissLabel: { [assetId]: faissLabelToRemove },
          faissLabelToId: { [faissLabelToRemove]: assetId },
          nextFaissLabel: 1
      }));

      await store.removeAssetVector(projectId, assetId);

      expect(mockFaissRemoveIds).toHaveBeenCalledWith([faissLabelToRemove]);
      const projectData = store.projectIndices[projectId];
      expect(projectData.idToFaissLabel[assetId]).toBeUndefined();
      expect(projectData.faissLabelToId[faissLabelToRemove]).toBeUndefined();
      expect(mockFaissWrite).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
});
