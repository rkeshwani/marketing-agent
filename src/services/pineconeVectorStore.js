// src/services/pineconeVectorStore.js
const { Pinecone } = require('@pinecone-database/pinecone');
const VectorStoreInterface = require('./vectorStoreInterface');
const config = require('../config/config');

class PineconeVectorStore extends VectorStoreInterface {
  constructor() {
    super();
    if (!config.PINECONE_API_KEY) {
      throw new Error('Pinecone API key is not configured. Please set PINECONE_API_KEY.');
    }
    if (!config.PINECONE_INDEX_NAME) {
      throw new Error('Pinecone index name is not configured. Please set PINECONE_INDEX_NAME.');
    }

    this.pinecone = new Pinecone({
      apiKey: config.PINECONE_API_KEY,
      // environment is not strictly required for initializing the client with newer versions,
      // especially if using serverless indexes where the host is determined after targeting an index.
      // If users have older pod-based indexes, they might need to ensure their Pinecone client setup
      // correctly resolves the environment or host.
    });
    this.indexName = config.PINECONE_INDEX_NAME;
    this.index = this.pinecone.index(this.indexName); // Target the index
    console.log(`PineconeVectorStore initialized for index: ${this.indexName}`);
  }

  /**
   * Adds or updates an asset's vector in the Pinecone index.
   * Pinecone's upsert operation creates a vector if it doesn't exist or updates it if it does.
   * @param {string} projectId - The ID of the project (used as namespace in Pinecone).
   * @param {string} assetId - The ID of the asset (used as vector ID in Pinecone).
   * @param {Array<number>} vector - The vector embedding of the asset.
   * @returns {Promise<void>}
   */
  async addAssetVector(projectId, assetId, vector) {
    if (!projectId) {
      console.warn('PineconeVectorStore: ProjectId (namespace) is missing. Using default namespace.');
      // Pinecone client defaults to empty string namespace if not specified.
      // Depending on desired behavior, could throw error or use a default.
    }
    const namespace = projectId || ''; // Use projectId as namespace, or default if not provided

    try {
      const records = [{
        id: assetId,
        values: vector,
        // metadata: { projectId } // Optional: store projectId in metadata if not using namespace or for redundancy
      }];
      await this.index.namespace(namespace).upsert(records);
      console.log(`PineconeVectorStore: Upserted vector for asset ${assetId} in namespace ${namespace}`);
    } catch (error) {
      console.error(`PineconeVectorStore: Error upserting vector for asset ${assetId} in namespace ${namespace}:`, error.message, error.stack);
      throw new Error(`Failed to add asset vector to Pinecone: ${error.message}`);
    }
  }

  /**
   * Finds similar assets in Pinecone based on a query vector.
   * @param {string} projectId - The ID of the project (used as namespace).
   * @param {Array<number>} queryVector - The vector to find similarities against.
   * @param {number} [topN=5] - The number of similar assets to return.
   * @returns {Promise<Array<string>>} A promise that resolves to an array of similar asset IDs.
   */
  async findSimilarAssets(projectId, queryVector, topN = 5) {
    if (!projectId) {
      console.warn('PineconeVectorStore: ProjectId (namespace) is missing for findSimilarAssets. Using default namespace.');
    }
    const namespace = projectId || '';

    if (!queryVector || queryVector.length === 0) {
      console.error('PineconeVectorStore: Query vector is undefined or empty.');
      return [];
    }

    try {
      const queryResponse = await this.index.namespace(namespace).query({
        vector: queryVector,
        topK: topN,
        // includeValues: false, // Default is false
        // includeMetadata: false, // Default is false
      });

      if (queryResponse && queryResponse.matches) {
        console.log(`PineconeVectorStore: Found ${queryResponse.matches.length} matches in namespace ${namespace}.`);
        return queryResponse.matches.map(match => match.id);
      } else {
        console.log(`PineconeVectorStore: No matches found or unexpected response structure in namespace ${namespace}.`);
        return [];
      }
    } catch (error) {
      console.error(`PineconeVectorStore: Error querying vectors in namespace ${namespace}:`, error.message, error.stack);
      // Specific error handling, e.g., for PineconeApiError
      if (error.name === 'PineconeArgumentError' && error.message.includes('vector_empty')) {
        // This might happen if the queryVector is empty, though we check above.
        console.warn(`PineconeVectorStore: Query vector was empty for namespace ${namespace}.`);
        return [];
      }
      // Check for common Pinecone errors, e.g., index not ready, dimension mismatch (though this should be caught earlier)
      // For instance, if an index is not found or ready, Pinecone client might throw specific errors.
      // It's good to log these details.
      throw new Error(`Failed to find similar assets in Pinecone: ${error.message}`);
    }
  }

  /**
   * Removes an asset's vector from the Pinecone index.
   * @param {string} projectId - The ID of the project (used as namespace).
   * @param {string} assetId - The ID of the asset to remove.
   * @returns {Promise<void>}
   */
  async removeAssetVector(projectId, assetId) {
    if (!projectId) {
      console.warn('PineconeVectorStore: ProjectId (namespace) is missing for removeAssetVector. Using default namespace.');
    }
    const namespace = projectId || '';

    try {
      await this.index.namespace(namespace).deleteMany([assetId]);
      console.log(`PineconeVectorStore: Deleted vector for asset ${assetId} from namespace ${namespace}`);
    } catch (error) {
      console.error(`PineconeVectorStore: Error deleting vector for asset ${assetId} from namespace ${namespace}:`, error.message, error.stack);
      // Pinecone might not throw an error if the ID doesn't exist, so this is more for operational errors.
      throw new Error(`Failed to remove asset vector from Pinecone: ${error.message}`);
    }
  }
}

module.exports = PineconeVectorStore;
