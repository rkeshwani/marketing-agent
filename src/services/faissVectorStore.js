// src/services/faissVectorStore.js
const fs = require('fs/promises');
const path = require('path');
const { IndexFlatL2, Index, MetricType } = require('faiss-node'); // Assuming IndexFlatL2 is suitable
const VectorStoreInterface = require('./vectorStoreInterface');
const config = require('../config/config');

// Helper to ensure directory exists
async function ensureDirExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') { // Ignore error if directory already exists
      console.error(`Error creating directory ${dirPath}:`, error);
      throw error;
    }
  }
}

class FaissVectorStore extends VectorStoreInterface {
  constructor() {
    super();
    this.indexPath = config.FAISS_INDEX_PATH;
    this.dimension = config.FAISS_DEFAULT_DIMENSION; // All vectors must have this dimension
    this.projectIndices = {}; // Cache for loaded indices { projectId: { index, idToFaissLabel, faissLabelToId, nextFaissLabel } }
    ensureDirExists(this.indexPath).catch(err => console.error("Failed to ensure FAISS index directory exists on init:", err));
    console.log(`FaissVectorStore initialized. Index path: ${this.indexPath}, Dimension: ${this.dimension}`);
  }

  _getProjectFilePaths(projectId) {
    const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9_-]/g, '');
    const indexFile = path.join(this.indexPath, `${sanitizedProjectId}.index`);
    const mappingFile = path.join(this.indexPath, `${sanitizedProjectId}.mapping.json`);
    return { indexFile, mappingFile };
  }

  async _loadProjectData(projectId) {
    if (this.projectIndices[projectId]) {
      return this.projectIndices[projectId];
    }

    await ensureDirExists(this.indexPath);
    const { indexFile, mappingFile } = this._getProjectFilePaths(projectId);
    let index;
    let idToFaissLabel = {};
    let faissLabelToId = {}; // Reverse mapping for search results
    let nextFaissLabel = 0;

    try {
      await fs.access(indexFile);
      index = IndexFlatL2.read(indexFile);
      if (index.getDimension() !== this.dimension) {
          console.warn(`Loaded FAISS index for project ${projectId} has dimension ${index.getDimension()}, expected ${this.dimension}. Re-initializing.`);
          index = new IndexFlatL2(this.dimension); // Re-initialize if dimension mismatch
      } else {
          console.log(`FAISS index loaded for project ${projectId} from ${indexFile}`);
      }
    } catch (error) {
      console.log(`No FAISS index found for project ${projectId}, creating new one.`);
      index = new IndexFlatL2(this.dimension);
    }

    try {
      await fs.access(mappingFile);
      const mappingData = JSON.parse(await fs.readFile(mappingFile, 'utf8'));
      idToFaissLabel = mappingData.idToFaissLabel || {};
      faissLabelToId = mappingData.faissLabelToId || {};
      nextFaissLabel = mappingData.nextFaissLabel || index.ntotal(); // Fallback if nextFaissLabel is missing
      console.log(`ID mapping loaded for project ${projectId}`);
    } catch (error) {
      console.log(`No ID mapping found for project ${projectId}, starting fresh.`);
      // Reconstruct faissLabelToId if index was loaded but mapping was not
      if (index.ntotal() > 0 && Object.keys(idToFaissLabel).length > 0) {
        faissLabelToId = Object.fromEntries(Object.entries(idToFaissLabel).map(([id, label]) => [label, id]));
      }
    }

    // Ensure nextFaissLabel is at least current total if mapping was partial or missing
    if (index.ntotal() > nextFaissLabel) {
        nextFaissLabel = index.ntotal();
    }


    const projectData = { index, idToFaissLabel, faissLabelToId, nextFaissLabel };
    this.projectIndices[projectId] = projectData;
    return projectData;
  }

  async _saveProjectData(projectId) {
    const projectData = this.projectIndices[projectId];
    if (!projectData) return;

    await ensureDirExists(this.indexPath);
    const { indexFile, mappingFile } = this._getProjectFilePaths(projectId);
    try {
      projectData.index.write(indexFile);
      await fs.writeFile(mappingFile, JSON.stringify({
        idToFaissLabel: projectData.idToFaissLabel,
        faissLabelToId: projectData.faissLabelToId,
        nextFaissLabel: projectData.nextFaissLabel
      }, null, 2));
      console.log(`FAISS index and mapping saved for project ${projectId}`);
    } catch (error) {
      console.error(`Error saving FAISS data for project ${projectId}:`, error);
    }
  }

  async addAssetVector(projectId, assetId, vector) {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension ${vector.length} does not match FAISS index dimension ${this.dimension}`);
    }
    const projectData = await this._loadProjectData(projectId);
    const { index, idToFaissLabel, faissLabelToId } = projectData;

    if (idToFaissLabel[assetId] !== undefined) {
      const existingFaissLabel = idToFaissLabel[assetId];
      console.warn(`FaissVectorStore: Asset ${assetId} already exists with FAISS label ${existingFaissLabel}. Attempting to remove old vector before adding new one.`);
      try {
        // faiss-node's removeIds might be problematic with label stability.
        // A more robust approach for updates might be to mark as deleted in mapping and handle during search,
        // or periodically rebuild the index. For now, we try removeIds.
        const removeResult = index.removeIds([existingFaissLabel]);
        if (removeResult === 0) {
            console.warn(`FaissVectorStore: Could not remove old vector for asset ${assetId} (FAISS label ${existingFaissLabel}). It might have already been removed or label is invalid.`);
        } else {
            console.log(`FaissVectorStore: Successfully removed old vector for asset ${assetId} (FAISS label ${existingFaissLabel}).`);
            delete faissLabelToId[existingFaissLabel]; // Remove from reverse mapping
            // Note: We don't decrement nextFaissLabel or try to reuse labels here to keep it simpler,
            // though this means labels are not compacted.
        }
      } catch (removeError) {
        console.error(`FaissVectorStore: Error removing existing vector for asset ${assetId} (FAISS label ${existingFaissLabel}):`, removeError);
        // Decide if to proceed or throw. For now, proceed to add the new one.
      }
    }

    // Add new vector. FAISS uses sequential integer labels starting from 0.
    // The `add` method itself does not return the label assigned.
    // We assume it's `ntotal` before adding, or manage `nextFaissLabel`.
    const currentFaissLabel = projectData.nextFaissLabel;
    index.add(vector); // Add the new vector

    idToFaissLabel[assetId] = currentFaissLabel;
    faissLabelToId[currentFaissLabel] = assetId;
    projectData.nextFaissLabel++; // Increment for the next vector

    console.log(`FaissVectorStore: Added vector for asset ${assetId} with FAISS label ${currentFaissLabel} for project ${projectId}. Index total: ${index.ntotal()}`);
    await this._saveProjectData(projectId);
  }

  async findSimilarAssets(projectId, queryVector, topN = 5) {
    if (queryVector.length !== this.dimension) {
      throw new Error(`Query vector dimension ${queryVector.length} does not match FAISS index dimension ${this.dimension}`);
    }
    const projectData = await this._loadProjectData(projectId);
    const { index, faissLabelToId } = projectData;

    if (index.ntotal() === 0) {
      console.log(`FaissVectorStore: Index for project ${projectId} is empty.`);
      return [];
    }

    // Ensure topN is not greater than the number of items in the index
    const actualTopN = Math.min(topN, index.ntotal());
    if (actualTopN === 0) return [];


    const results = index.search(queryVector, actualTopN);
    const assetIds = results.labels
      .map(label => faissLabelToId[label])
      .filter(id => id !== undefined); // Filter out any undefined IDs if a label somehow doesn't map back

    console.log(`FaissVectorStore: Found ${assetIds.length} similar assets for project ${projectId}. FAISS labels: ${results.labels}`);
    return assetIds;
  }

  async removeAssetVector(projectId, assetId) {
    const projectData = await this._loadProjectData(projectId);
    const { index, idToFaissLabel, faissLabelToId } = projectData;

    const faissLabel = idToFaissLabel[assetId];
    if (faissLabel === undefined) {
      console.log(`FaissVectorStore: Asset ${assetId} not found in mapping for project ${projectId}. Nothing to remove.`);
      return;
    }

    try {
      const numRemoved = index.removeIds([faissLabel]); // removeIds expects an array of labels
      if (numRemoved > 0) {
        delete idToFaissLabel[assetId];
        delete faissLabelToId[faissLabel];
        // Important: `removeIds` can re-order subsequent IDs in some FAISS index types.
        // For IndexFlatL2, it marks as removed and might not re-order, but ntotal decreases.
        // We are not re-compacting or re-adjusting nextFaissLabel here for simplicity.
        // This means labels are not reused, and the index might grow in file size even with removals over time
        // until a rebuild (which is not implemented here).
        console.log(`FaissVectorStore: Removed asset ${assetId} (FAISS label ${faissLabel}) for project ${projectId}. Num removed by FAISS: ${numRemoved}. Index total: ${index.ntotal()}`);
      } else {
        console.warn(`FaissVectorStore: removeIds for FAISS label ${faissLabel} (asset ${assetId}) returned 0. Vector might have already been removed or label was invalid. Still removing from mapping.`);
        delete idToFaissLabel[assetId];
        delete faissLabelToId[faissLabel];
      }
      await this._saveProjectData(projectId);
    } catch (error) {
      console.error(`FaissVectorStore: Error removing asset ${assetId} (FAISS label ${faissLabel}) for project ${projectId}:`, error);
      throw new Error(`Failed to remove asset vector from FAISS: ${error.message}`);
    }
  }
}

module.exports = FaissVectorStore;
