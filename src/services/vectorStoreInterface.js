// src/services/vectorStoreInterface.js

/**
 * Interface for a vector store.
 * All vector store implementations should provide these methods.
 */
class VectorStoreInterface {
  /**
   * Adds or updates an asset's vector in the project's vector store.
   * @param {string} projectId - The ID of the project.
   * @param {string} assetId - The ID of the asset.
   * @param {Array<number>} vector - The vector embedding of the asset.
   * @returns {Promise<void>}
   * @throws {Error} if the operation fails.
   */
  async addAssetVector(projectId, assetId, vector) {
    throw new Error("Method 'addAssetVector()' must be implemented.");
  }

  /**
   * Finds similar assets in a project based on a query vector.
   * @param {string} projectId - The ID of the project.
   * @param {Array<number>} queryVector - The vector to find similarities against.
   * @param {number} [topN=5] - The number of similar assets to return.
   * @returns {Promise<Array<string>>} A promise that resolves to an array of similar asset IDs.
   * @throws {Error} if the operation fails.
   */
  async findSimilarAssets(projectId, queryVector, topN = 5) {
    throw new Error("Method 'findSimilarAssets()' must be implemented.");
  }

  /**
   * Removes an asset's vector from the project's vector store.
   * @param {string} projectId - The ID of the project.
   * @param {string} assetId - The ID of the asset to remove.
   * @returns {Promise<void>}
   * @throws {Error} if the operation fails or if the asset is not found.
   */
  async removeAssetVector(projectId, assetId) {
    throw new Error("Method 'removeAssetVector()' must be implemented.");
  }
}

module.exports = VectorStoreInterface;
