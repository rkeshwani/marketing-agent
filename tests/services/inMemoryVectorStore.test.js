// tests/services/inMemoryVectorStore.test.js
const InMemoryVectorStore = require('../../src/services/inMemoryVectorStore');

describe('InMemoryVectorStore', () => {
  let store;
  const projectId = 'testProject';
  const assetId1 = 'asset1';
  const vector1 = [0.1, 0.2, 0.3];
  const assetId2 = 'asset2';
  const vector2 = [0.4, 0.5, 0.6];
  const assetId3 = 'asset3';
  const vector3 = [0.11, 0.22, 0.33]; // Similar to vector1

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  test('should initialize an empty store', () => {
    expect(store.projectVectorStores).toEqual({});
  });

  describe('addAssetVector', () => {
    test('should add a new asset vector', async () => {
      await store.addAssetVector(projectId, assetId1, vector1);
      expect(store.projectVectorStores[projectId]).toEqual([{ assetId: assetId1, vector: vector1 }]);
    });

    test('should update an existing asset vector', async () => {
      await store.addAssetVector(projectId, assetId1, vector1);
      const updatedVector = [0.7, 0.8, 0.9];
      await store.addAssetVector(projectId, assetId1, updatedVector);
      expect(store.projectVectorStores[projectId]).toEqual([{ assetId: assetId1, vector: updatedVector }]);
    });

    test('should handle multiple projects', async () => {
      const projectId2 = 'testProject2';
      await store.addAssetVector(projectId, assetId1, vector1);
      await store.addAssetVector(projectId2, assetId2, vector2);
      expect(store.projectVectorStores[projectId]).toEqual([{ assetId: assetId1, vector: vector1 }]);
      expect(store.projectVectorStores[projectId2]).toEqual([{ assetId: assetId2, vector: vector2 }]);
    });
  });

  describe('removeAssetVector', () => {
    test('should remove an existing asset vector', async () => {
      await store.addAssetVector(projectId, assetId1, vector1);
      await store.addAssetVector(projectId, assetId2, vector2);
      await store.removeAssetVector(projectId, assetId1);
      expect(store.projectVectorStores[projectId]).toEqual([{ assetId: assetId2, vector: vector2 }]);
      expect(store.projectVectorStores[projectId].length).toBe(1);
    });

    test('should do nothing if asset vector does not exist', async () => {
      await store.addAssetVector(projectId, assetId1, vector1);
      await store.removeAssetVector(projectId, 'nonExistentAsset');
      expect(store.projectVectorStores[projectId]).toEqual([{ assetId: assetId1, vector: vector1 }]);
    });

    test('should remove project store if it becomes empty', async () => {
      await store.addAssetVector(projectId, assetId1, vector1);
      await store.removeAssetVector(projectId, assetId1);
      expect(store.projectVectorStores[projectId]).toBeUndefined();
    });

    test('should do nothing if project does not exist', async () => {
      await store.removeAssetVector('nonExistentProject', assetId1);
      expect(store.projectVectorStores['nonExistentProject']).toBeUndefined();
    });
  });

  describe('findSimilarAssets', () => {
    beforeEach(async () => {
      await store.addAssetVector(projectId, assetId1, vector1); // [0.1, 0.2, 0.3]
      await store.addAssetVector(projectId, assetId2, vector2); // [0.4, 0.5, 0.6]
      await store.addAssetVector(projectId, assetId3, vector3); // [0.11, 0.22, 0.33] - similar to assetId1
    });

    test('should find the most similar assets', async () => {
      const queryVector = [0.09, 0.19, 0.29]; // Very close to vector1
      const similarAssets = await store.findSimilarAssets(projectId, queryVector, 2);
      expect(similarAssets.length).toBe(2);
      expect(similarAssets[0]).toBe(assetId1);
      expect(similarAssets[1]).toBe(assetId3); // vector3 is closer than vector2
    });

    test('should return empty array if no vectors in project', async () => {
      const similarAssets = await store.findSimilarAssets('emptyProject', vector1);
      expect(similarAssets).toEqual([]);
    });

    test('should return empty array if query vector dimensionality mismatch', async () => {
      const queryVectorMismatch = [0.1, 0.2];
      // Suppress console.warn for this specific test case if it's noisy
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const similarAssets = await store.findSimilarAssets(projectId, queryVectorMismatch);
      expect(similarAssets).toEqual([]);
      consoleWarnSpy.mockRestore();
    });

    test('should handle query vector being undefined or empty', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        let similarAssets = await store.findSimilarAssets(projectId, undefined);
        expect(similarAssets).toEqual([]);
        similarAssets = await store.findSimilarAssets(projectId, []);
        expect(similarAssets).toEqual([]);
        consoleErrorSpy.mockRestore();
    });


    test('should return topN results', async () => {
      const queryVector = [0.09, 0.19, 0.29];
      let similarAssets = await store.findSimilarAssets(projectId, queryVector, 1);
      expect(similarAssets.length).toBe(1);
      expect(similarAssets[0]).toBe(assetId1);

      similarAssets = await store.findSimilarAssets(projectId, queryVector, 3);
      expect(similarAssets.length).toBe(3); // All assets in store
      expect(similarAssets).toEqual(expect.arrayContaining([assetId1, assetId2, assetId3]));
    });

    test('_euclideanDistance should calculate distance correctly', () => {
        const vA = [1, 2, 3];
        const vB = [4, 6, 8]; // (3^2 + 4^2 + 5^2) = 9 + 16 + 25 = 50. sqrt(50)
        const expectedDistance = Math.sqrt(50);
        expect(store._euclideanDistance(vA, vB)).toBeCloseTo(expectedDistance);
      });

    test('_euclideanDistance should throw error for different length vectors', () => {
    const vA = [1, 2, 3];
    const vC = [1, 2];
    expect(() => store._euclideanDistance(vA, vC)).toThrow("Vectors must exist and have the same dimensionality for Euclidean distance.");
    });
  });
});
