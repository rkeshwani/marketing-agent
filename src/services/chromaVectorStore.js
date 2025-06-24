// src/services/chromaVectorStore.js
const { ChromaClient } = require('chromadb');
const VectorStoreInterface = require('./vectorStoreInterface');
const config = require('../config/config');

function getChromaCollectionName(projectId) {
  if (!projectId) {
    throw new Error("ProjectId is required to determine Chroma collection name.");
  }
  // Sanitize projectId: Chroma collection names must be 3-63 chars, start/end with alphanumeric,
  // and only contain alphanumeric, underscore, or dash, with no two consecutive dots.
  let sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '').replace(/\.\./g, '.');
  if (sanitizedProjectId.length === 0) sanitizedProjectId = 'defaultproject'; // Handle empty after sanitize

  let collectionName = `${config.CHROMA_COLLECTION_NAME_PREFIX}${sanitizedProjectId}`;

  // Enforce length constraints (simplified check)
  if (collectionName.length < 3) collectionName = `${collectionName}___`; // Pad if too short
  if (collectionName.length > 63) collectionName = collectionName.substring(0, 63);

  // Ensure it starts and ends with alphanumeric
  if (!/^[a-zA-Z0-9]/.test(collectionName)) collectionName = `p${collectionName.substring(1)}`;
  if (collectionName.length > 63) collectionName = collectionName.substring(0, 63); // Re-check length after padding
  if (!/[a-zA-Z0-9]$/.test(collectionName)) collectionName = `${collectionName.substring(0, collectionName.length -1)}e`;
  if (collectionName.length > 63) collectionName = collectionName.substring(0, 63); // Re-check length after padding

  return collectionName;
}

class ChromaVectorStore extends VectorStoreInterface {
  constructor() {
    super();
    const clientParams = {};
    if (config.CHROMA_PATH) {
      clientParams.path = config.CHROMA_PATH;
    }
    // If CHROMA_PATH is empty, it defaults to in-memory/local file-based, which is fine.
    this.client = new ChromaClient(clientParams);
    console.log(`ChromaVectorStore initialized. Path: ${config.CHROMA_PATH || 'in-memory/local default'}`);
  }

  async _getOrCreateCollection(projectId) {
    const collectionName = getChromaCollectionName(projectId);
    try {
      // metadata: { "hnsw:space": "l2" } // Example for L2 distance, cosine is often default
      // It's important that the distance metric matches what generateEmbedding implies (euclidean in our case).
      // Chroma's default is l2, which is Euclidean.
      const collection = await this.client.getOrCreateCollection({ name: collectionName });
      return collection;
    } catch (error) {
      console.error(`ChromaVectorStore: Error getting or creating collection ${collectionName}:`, error.message, error.stack);
      throw new Error(`Failed to get/create Chroma collection: ${error.message}`);
    }
  }

  async addAssetVector(projectId, assetId, vector) {
    const collection = await this._getOrCreateCollection(projectId);
    try {
      // Chroma's add functions as an upsert if the ID already exists.
      await collection.add({
        ids: [assetId],
        embeddings: [vector],
        metadatas: [{ projectId, assetIdString: assetId }], // Store original assetId for clarity if needed, projectId for context
      });
      console.log(`ChromaVectorStore: Added/Updated vector for asset ${assetId} in collection for project ${projectId}`);
    } catch (error) {
      console.error(`ChromaVectorStore: Error adding/updating vector for asset ${assetId}:`, error.message, error.stack);
      throw new Error(`Failed to add asset vector to Chroma: ${error.message}`);
    }
  }

  async findSimilarAssets(projectId, queryVector, topN = 5) {
    const collection = await this._getOrCreateCollection(projectId);

    if (!queryVector || queryVector.length === 0) {
      console.error('ChromaVectorStore: Query vector is undefined or empty.');
      return [];
    }

    try {
      const results = await collection.query({
        queryEmbeddings: [queryVector],
        nResults: topN,
        // include: ['metadatas', 'distances'] // Optionally include metadata or distances
      });

      if (results && results.ids && results.ids.length > 0 && results.ids[0]) {
        console.log(`ChromaVectorStore: Found ${results.ids[0].length} matches for project ${projectId}.`);
        return results.ids[0]; // query returns { ids: [[]], embeddings: [[]], metadatas: [[]], documents: [[]], distances: [[]], uris: [[]] }
      } else {
        console.log(`ChromaVectorStore: No matches found for project ${projectId}.`);
        return [];
      }
    } catch (error) {
      // Chroma client might throw error if collection is empty or other issues.
      if (error.message && error.message.includes("Number of requested results") && error.message.includes("exceeds number of elements in index")) {
        console.warn(`ChromaVectorStore: Query for ${topN} results in project ${projectId} but collection has fewer items. Returning all available. Error: ${error.message}`);
        // Attempt to query for all available items if topN is too high for a small collection
        try {
            const count = await collection.count();
            if (count === 0) return [];
            const allResults = await collection.query({
                queryEmbeddings: [queryVector],
                nResults: Math.max(1, count) // Ensure nResults is at least 1
            });
            return allResults.ids && allResults.ids.length > 0 ? allResults.ids[0] : [];
        } catch (retryError) {
            console.error(`ChromaVectorStore: Error during retry query for project ${projectId}:`, retryError.message, retryError.stack);
             throw new Error(`Failed to find similar assets in Chroma after retry: ${retryError.message}`);
        }
      }
      console.error(`ChromaVectorStore: Error querying vectors for project ${projectId}:`, error.message, error.stack);
      throw new Error(`Failed to find similar assets in Chroma: ${error.message}`);
    }
  }

  async removeAssetVector(projectId, assetId) {
    const collection = await this._getOrCreateCollection(projectId);
    try {
      // Deleting by ID. If the ID doesn't exist, ChromaDB usually doesn't throw an error.
      await collection.delete({ ids: [assetId] });
      console.log(`ChromaVectorStore: Attempted deletion for asset ${assetId} in collection for project ${projectId}.`);
    } catch (error) {
      console.error(`ChromaVectorStore: Error deleting vector for asset ${assetId}:`, error.message, error.stack);
      throw new Error(`Failed to remove asset vector from Chroma: ${error.message}`);
    }
  }
}

module.exports = ChromaVectorStore;
