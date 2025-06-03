// src/services/vectorService.js

const projectVectorStores = {}; // In-memory vector store

/**
 * Generates a vector embedding and tags for the given content.
 * Placeholder function: Simulates embedding and tagging.
 * @param {string} content - The text content to process.
 * @returns {Promise<{vector: Array<number>, tags: Array<string>}>}
 */
async function generateEmbedding(content) {
  console.log(`VectorService: Generating embedding for content: "${content.substring(0, 50)}..."`);
  // Simulate API call delay or processing time
  await new Promise(resolve => setTimeout(resolve, 100));

  // Simulate a vector (e.g., 10-dimensional vector of random numbers)
  const vector = Array.from({ length: 10 }, () => Math.random());

  // Simulate tags based on content (very basic example)
  const tags = content.toLowerCase().split(/\s+/).slice(0, 5); // First 5 words as tags

  return { vector, tags };
}

/**
 * Calculates the Euclidean distance between two vectors.
 * @param {Array<number>} vec1 - The first vector.
 * @param {Array<number>} vec2 - The second vector.
 * @returns {number} The Euclidean distance.
 */
function euclideanDistance(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error("Vectors must have the same dimensionality for Euclidean distance.");
  }
  return Math.sqrt(vec1.reduce((sum, val, index) => sum + (val - vec2[index])**2, 0));
}

/**
 * Adds or updates an asset's vector in the project's vector store.
 * @param {string} projectId - The ID of the project.
 * @param {string} assetId - The ID of the asset.
 * @param {Array<number>} vector - The vector embedding of the asset.
 */
function addAssetVector(projectId, assetId, vector) {
  if (!projectVectorStores[projectId]) {
    projectVectorStores[projectId] = [];
  }
  // Check if asset vector already exists and update, or add new
  const existingAssetIndex = projectVectorStores[projectId].findIndex(item => item.assetId === assetId);
  if (existingAssetIndex > -1) {
    projectVectorStores[projectId][existingAssetIndex].vector = vector;
    console.log(`VectorService: Updated vector for asset ${assetId} in project ${projectId}`);
  } else {
    projectVectorStores[projectId].push({ assetId, vector });
    console.log(`VectorService: Added vector for asset ${assetId} to project ${projectId}`);
  }
}

/**
 * Finds similar assets in a project based on a query vector.
 * @param {string} projectId - The ID of the project.
 * @param {Array<number>} queryVector - The vector to find similarities against.
 * @param {number} topN - The number of similar assets to return.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of similar asset IDs.
 */
async function findSimilarAssets(projectId, queryVector, topN = 5) {
  if (!projectVectorStores[projectId] || projectVectorStores[projectId].length === 0) {
    console.log(`VectorService: No vectors found for project ${projectId} or project store empty.`);
    return [];
  }

  const store = projectVectorStores[projectId];
  if (store.some(item => item.vector.length !== queryVector.length)) {
    console.error("VectorService: Query vector dimensionality does not match store vector dimensionality.");
    // Or handle more gracefully, e.g. by filtering out non-matching vectors or throwing specific error
    return []; // Or throw new Error("Dimensionality mismatch");
  }

  const distances = store.map(item => ({
    assetId: item.assetId,
    distance: euclideanDistance(queryVector, item.vector)
  }));

  distances.sort((a, b) => a.distance - b.distance);
  console.log(`VectorService: Found ${distances.length} assets, returning top ${topN}`);
  return distances.slice(0, topN).map(item => item.assetId);
}

/**
 * Removes an asset's vector from the project's vector store.
 * @param {string} projectId - The ID of the project.
 * @param {string} assetId - The ID of the asset to remove.
 */
function removeAssetVector(projectId, assetId) {
  if (projectVectorStores[projectId]) {
    const initialLength = projectVectorStores[projectId].length;
    projectVectorStores[projectId] = projectVectorStores[projectId].filter(item => item.assetId !== assetId);
    if (projectVectorStores[projectId].length < initialLength) {
      console.log(`VectorService: Removed vector for asset ${assetId} from project ${projectId}`);
    } else {
      console.log(`VectorService: No vector found for asset ${assetId} in project ${projectId} to remove.`);
    }
    // Optional: Clean up empty project store
    if (projectVectorStores[projectId].length === 0) {
      delete projectVectorStores[projectId];
      console.log(`VectorService: Project store for ${projectId} is now empty and removed.`);
    }
  } else {
    console.log(`VectorService: No vector store found for project ${projectId}. Nothing to remove.`);
  }
}

module.exports = {
  generateEmbedding,
  addAssetVector,
  findSimilarAssets,
  removeAssetVector, // Export the new function
  // euclideanDistance is not exported as it's a helper for findSimilarAssets
};
