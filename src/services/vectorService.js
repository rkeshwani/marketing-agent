// src/services/vectorService.js
const config = require('../config/config');
const InMemoryVectorStore = require('./inMemoryVectorStore');
const PineconeVectorStore = require('./pineconeVectorStore');
const WeaviateVectorStore = require('./weaviateVectorStore');
const ChromaVectorStore = require('./chromaVectorStore');
const FaissVectorStore = require('./faissVectorStore');
const PgvectorStore = require('./pgvectorStore');
// Future: Import other vector stores like
// const DatabaseVectorStore = require('./databaseVectorStore');

let vectorStoreInstance;

/**
 * Initializes and returns the configured vector store instance.
 * @returns {VectorStoreInterface} The vector store instance.
 * @throws {Error} if the configured provider is not supported.
 */
function getVectorStore() {
  if (!vectorStoreInstance) {
    const provider = config.VECTOR_STORE_PROVIDER || 'inMemory'; // Default to inMemory
    console.log(`VectorService: Initializing vector store with provider: ${provider}`);

    switch (provider.toLowerCase()) {
      case 'inmemory':
        vectorStoreInstance = new InMemoryVectorStore();
        break;
      case 'pinecone':
        vectorStoreInstance = new PineconeVectorStore();
        break;
      case 'weaviate':
        vectorStoreInstance = new WeaviateVectorStore();
        break;
      case 'chroma':
        vectorStoreInstance = new ChromaVectorStore();
        break;
      case 'faiss':
        vectorStoreInstance = new FaissVectorStore();
        break;
      case 'pgvector':
        vectorStoreInstance = new PgvectorStore();
        break;
      // Example for future providers:
      // case 'database':
      //   vectorStoreInstance = new DatabaseVectorStore(config.DATABASE_CONNECTION_STRING);
      //   break;
      default:
        throw new Error(`Unsupported vector store provider: ${provider}`);
    }
  }
  return vectorStoreInstance;
}

/**
 * Generates a vector embedding for the given content.
 * This function is kept separate as it's a utility for generating embeddings,
 * not directly part of the storage mechanism.
 * Placeholder function: Simulates embedding generation.
 * @param {string} content - The text content to process.
 * @returns {Promise<{vector: Array<number>, tags: Array<string>}>}
 */
async function generateEmbedding(content) {
  console.log(`VectorService (EmbeddingUtil): Generating embedding for content: "${content.substring(0, 50)}..."`);
  // Simulate API call delay or processing time for embedding generation
  await new Promise(resolve => setTimeout(resolve, 100));

  // Simulate a vector (e.g., 10-dimensional vector of random numbers)
  const vector = Array.from({ length: 10 }, () => Math.random());

  // Simulate tags based on content (very basic example)
  const tags = content.toLowerCase().split(/\s+/).slice(0, 5); // First 5 words as tags

  return { vector, tags };
}

/**
 * Adds or updates an asset's vector using the configured vector store.
 * @param {string} projectId - The ID of the project.
 * @param {string} assetId - The ID of the asset.
 * @param {Array<number>} vector - The vector embedding of the asset.
 * @returns {Promise<void>}
 */
async function addAssetVector(projectId, assetId, vector) {
  const store = getVectorStore();
  return store.addAssetVector(projectId, assetId, vector);
}

/**
 * Finds similar assets using the configured vector store.
 * @param {string} projectId - The ID of the project.
 * @param {Array<number>} queryVector - The vector to find similarities against.
 * @param {number} [topN=5] - The number of similar assets to return.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of similar asset IDs.
 */
async function findSimilarAssets(projectId, queryVector, topN = 5) {
  const store = getVectorStore();
  return store.findSimilarAssets(projectId, queryVector, topN);
}

/**
 * Removes an asset's vector using the configured vector store.
 * @param {string} projectId - The ID of the project.
 * @param {string} assetId - The ID of the asset to remove.
 * @returns {Promise<void>}
 */
async function removeAssetVector(projectId, assetId) {
  const store = getVectorStore();
  return store.removeAssetVector(projectId, assetId);
}

module.exports = {
  generateEmbedding, // Utility function
  addAssetVector,
  findSimilarAssets,
  removeAssetVector,
  getVectorStore, // Exporting for potential direct use or testing
};
