// src/services/inMemoryVectorStore.js

const VectorStoreInterface = require('./vectorStoreInterface');

/**
 * In-memory implementation of the VectorStoreInterface.
 * Stores vectors in a JavaScript object in memory.
 */
class InMemoryVectorStore extends VectorStoreInterface {
  constructor() {
    super();
    this.projectVectorStores = {}; // In-memory vector store
    console.log("InMemoryVectorStore initialized.");
  }

  /**
   * Calculates the Euclidean distance between two vectors.
   * @param {Array<number>} vec1 - The first vector.
   * @param {Array<number>} vec2 - The second vector.
   * @returns {number} The Euclidean distance.
   * @throws {Error} if vectors do not have the same dimensionality.
   */
  _euclideanDistance(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
      throw new Error("Vectors must exist and have the same dimensionality for Euclidean distance.");
    }
    return Math.sqrt(vec1.reduce((sum, val, index) => sum + (val - vec2[index])**2, 0));
  }

  /**
   * Adds or updates an asset's vector in the project's vector store.
   * @param {string} projectId - The ID of the project.
   * @param {string} assetId - The ID of the asset.
   * @param {Array<number>} vector - The vector embedding of the asset.
   * @returns {Promise<void>}
   */
  async addAssetVector(projectId, assetId, vector) {
    if (!this.projectVectorStores[projectId]) {
      this.projectVectorStores[projectId] = [];
    }
    const existingAssetIndex = this.projectVectorStores[projectId].findIndex(item => item.assetId === assetId);
    if (existingAssetIndex > -1) {
      this.projectVectorStores[projectId][existingAssetIndex].vector = vector;
      console.log(`InMemoryVectorStore: Updated vector for asset ${assetId} in project ${projectId}`);
    } else {
      this.projectVectorStores[projectId].push({ assetId, vector });
      console.log(`InMemoryVectorStore: Added vector for asset ${assetId} to project ${projectId}`);
    }
    return Promise.resolve();
  }

  /**
   * Finds similar assets in a project based on a query vector.
   * @param {string} projectId - The ID of the project.
   * @param {Array<number>} queryVector - The vector to find similarities against.
   * @param {number} [topN=5] - The number of similar assets to return.
   * @returns {Promise<Array<string>>} A promise that resolves to an array of similar asset IDs.
   */
  async findSimilarAssets(projectId, queryVector, topN = 5) {
    if (!this.projectVectorStores[projectId] || this.projectVectorStores[projectId].length === 0) {
      console.log(`InMemoryVectorStore: No vectors found for project ${projectId} or project store empty.`);
      return Promise.resolve([]);
    }

    const store = this.projectVectorStores[projectId];
    // Ensure queryVector is valid before proceeding
    if (!queryVector || queryVector.length === 0) {
        console.error("InMemoryVectorStore: Query vector is undefined or empty.");
        return Promise.resolve([]); // Or throw new Error("Query vector cannot be empty.");
    }

    // Filter out items with undefined or mismatched-length vectors before calculating distance
    const validItems = store.filter(item => item.vector && item.vector.length === queryVector.length);

    if (store.some(item => item.vector && item.vector.length !== queryVector.length)) {
      console.warn(`InMemoryVectorStore: Some vectors in project ${projectId} have different dimensionality than the query vector. They will be ignored.`);
    }

    if (validItems.length === 0 && store.length > 0) {
        console.error(`InMemoryVectorStore: No vectors in project ${projectId} match the query vector's dimensionality (${queryVector.length}).`);
        return Promise.resolve([]);
    }


    const distances = validItems.map(item => ({
      assetId: item.assetId,
      distance: this._euclideanDistance(queryVector, item.vector)
    }));

    distances.sort((a, b) => a.distance - b.distance);
    console.log(`InMemoryVectorStore: Found ${distances.length} similar assets for project ${projectId}, returning top ${topN}`);
    return Promise.resolve(distances.slice(0, topN).map(item => item.assetId));
  }

  /**
   * Removes an asset's vector from the project's vector store.
   * @param {string} projectId - The ID of the project.
   * @param {string} assetId - The ID of the asset to remove.
   * @returns {Promise<void>}
   */
  async removeAssetVector(projectId, assetId) {
    if (this.projectVectorStores[projectId]) {
      const initialLength = this.projectVectorStores[projectId].length;
      this.projectVectorStores[projectId] = this.projectVectorStores[projectId].filter(item => item.assetId !== assetId);
      if (this.projectVectorStores[projectId].length < initialLength) {
        console.log(`InMemoryVectorStore: Removed vector for asset ${assetId} from project ${projectId}`);
      } else {
        console.log(`InMemoryVectorStore: No vector found for asset ${assetId} in project ${projectId} to remove.`);
      }
      if (this.projectVectorStores[projectId].length === 0) {
        delete this.projectVectorStores[projectId];
        console.log(`InMemoryVectorStore: Project store for ${projectId} is now empty and removed.`);
      }
    } else {
      console.log(`InMemoryVectorStore: No vector store found for project ${projectId}. Nothing to remove.`);
    }
    return Promise.resolve();
  }
}

module.exports = InMemoryVectorStore;
