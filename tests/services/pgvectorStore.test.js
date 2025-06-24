// tests/services/pgvectorStore.test.js
const PgvectorStore = require('../../src/services/pgvectorStore');
const config = require('../../src/config/config');

// Mock the 'pg' module
const mockQuery = jest.fn();
const mockConnect = jest.fn(() => ({
  query: mockQuery,
  release: jest.fn(),
}));
const mockPoolEnd = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: mockConnect,
    on: jest.fn(), // Mock the 'on' event listener setup
    end: mockPoolEnd,
  })),
}));

describe('PgvectorStore', () => {
  let originalPgConnectionString;
  let originalPgTablePrefix;
  let originalPgDimension;

  beforeAll(() => {
    originalPgConnectionString = config.PGVECTOR_CONNECTION_STRING;
    originalPgTablePrefix = config.PGVECTOR_TABLE_NAME_PREFIX;
    originalPgDimension = config.PGVECTOR_DEFAULT_DIMENSION;
  });

  afterAll(() => {
    config.PGVECTOR_CONNECTION_STRING = originalPgConnectionString;
    config.PGVECTOR_TABLE_NAME_PREFIX = originalPgTablePrefix;
    config.PGVECTOR_DEFAULT_DIMENSION = originalPgDimension;
  });

  beforeEach(() => {
    config.PGVECTOR_CONNECTION_STRING = 'postgresql://testuser:testpass@localhost:5432/testdb';
    config.PGVECTOR_TABLE_NAME_PREFIX = 'test_vectors_';
    config.PGVECTOR_DEFAULT_DIMENSION = 3;

    jest.clearAllMocks();

    // Default successful query resolves
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  test('constructor should throw error if connection string is not configured', () => {
    config.PGVECTOR_CONNECTION_STRING = '';
    expect(() => new PgvectorStore()).toThrow('PostgreSQL connection string (PGVECTOR_CONNECTION_STRING) is not configured.');
  });

  test('constructor should initialize pg.Pool and ensure vector extension', async () => {
    const store = new PgvectorStore(); // constructor calls _ensureVectorExtension
    // Wait for the async _ensureVectorExtension to complete
    await new Promise(resolve => setTimeout(resolve, 0)); // Allow microtasks to run

    expect(require('pg').Pool).toHaveBeenCalledWith({ connectionString: config.PGVECTOR_CONNECTION_STRING });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledWith('CREATE EXTENSION IF NOT EXISTS vector;');
    // Check that client.release was called for _ensureVectorExtension
    expect(mockConnect().release).toHaveBeenCalled();
  });

  describe('_ensureTableExists', () => {
    test('should create table if it does not exist', async () => {
      const store = new PgvectorStore();
      const projectId = 'projectTable';
      // _ensureVectorExtension will be called by constructor, clear its mockQuery call
      mockQuery.mockClear();
      mockConnect().release.mockClear();

      await store._ensureTableExists(projectId);

      const expectedTableName = `test_vectors_projecttable`;
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining(`CREATE TABLE IF NOT EXISTS "${expectedTableName}"`));
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining(`VECTOR(${store.dimension})`));
      expect(mockConnect().release).toHaveBeenCalled();
    });
  });

  describe('addAssetVector', () => {
    test('should insert/update vector in the correct table', async () => {
      const store = new PgvectorStore();
      const projectId = 'projectAdd';
      const assetId = 'asset1';
      const vector = [0.1, 0.2, 0.3];

      // Mock _ensureTableExists to resolve without actually calling DB for this specific test part
      store._ensureTableExists = jest.fn().mockResolvedValue(undefined);

      await store.addAssetVector(projectId, assetId, vector);

      expect(store._ensureTableExists).toHaveBeenCalledWith(projectId);
      const expectedTableName = `test_vectors_projectadd`;
      const formattedVector = `[${vector.join(',')}]`;
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(`INSERT INTO "${expectedTableName}" (asset_id, embedding)`),
        [assetId, formattedVector]
      );
    });

     test('should throw error if vector dimension mismatch', async () => {
      const store = new PgvectorStore();
      await expect(store.addAssetVector('p1', 'a1', [1, 2])) // Dimension 2, expecting 3
        .rejects.toThrow('Vector dimension 2 does not match pgvector table dimension 3');
    });
  });

  describe('findSimilarAssets', () => {
    test('should query vectors and return asset IDs', async () => {
      const store = new PgvectorStore();
      const projectId = 'projectQuery';
      const queryVector = [0.1, 0.2, 0.3];
      const topN = 2;
      const mockRows = [{ asset_id: 'assetA' }, { asset_id: 'assetB' }];
      mockQuery.mockResolvedValueOnce({ rows: mockRows, rowCount: mockRows.length });

      const results = await store.findSimilarAssets(projectId, queryVector, topN);

      const expectedTableName = `test_vectors_projectquery`;
      const formattedQueryVector = `[${queryVector.join(',')}]`;
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining(`SELECT asset_id FROM "${expectedTableName}"`),
        [formattedQueryVector, topN]
      );
      expect(results).toEqual(['assetA', 'assetB']);
    });

    test('should return empty array if table does not exist (query error)', async () => {
        const store = new PgvectorStore();
        mockQuery.mockRejectedValueOnce(new Error("relation \"test_vectors_nonexistent\" does not exist"));
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const results = await store.findSimilarAssets('nonexistent', [0.1,0.2,0.3]);
        expect(results).toEqual([]);
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Table \"test_vectors_nonexistent\" does not exist. Returning empty results."));
        consoleWarnSpy.mockRestore();
    });
  });

  describe('removeAssetVector', () => {
    test('should delete vector by assetId', async () => {
      const store = new PgvectorStore();
      const projectId = 'projectRemove';
      const assetId = 'assetToRemove';
      mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Simulate 1 row deleted

      await store.removeAssetVector(projectId, assetId);

      const expectedTableName = `test_vectors_projectremove`;
      expect(mockQuery).toHaveBeenCalledWith(
        `DELETE FROM "${expectedTableName}" WHERE asset_id = $1;`,
        [assetId]
      );
    });
  });

  test('closePool should end the pool', async () => {
    const store = new PgvectorStore();
    await store.closePool();
    expect(mockPoolEnd).toHaveBeenCalled();
  });
});
