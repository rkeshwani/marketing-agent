// src/services/weaviateVectorStore.js
const weaviate = require('weaviate-ts-client');
const VectorStoreInterface = require('./vectorStoreInterface');
const config = require('../config/config');

// Weaviate class names must be capitalized.
function getWeaviateClassName(projectId) {
  if (!projectId) {
    throw new Error("ProjectId is required to determine Weaviate class name.");
  }
  // Sanitize projectId to ensure it's valid for a class name (alphanumeric)
  const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9_]/g, '');
  return `${config.WEAVIATE_CLASS_NAME_PREFIX}${sanitizedProjectId}`;
}

class WeaviateVectorStore extends VectorStoreInterface {
  constructor() {
    super();
    let clientConfig = {
      scheme: config.WEAVIATE_SCHEME,
      host: config.WEAVIATE_HOST,
    };

    if (config.WEAVIATE_API_KEY) {
      clientConfig.apiKey = new weaviate.ApiKey(config.WEAVIATE_API_KEY);
    }

    this.client = weaviate.client(clientConfig);
    console.log(`WeaviateVectorStore initialized for host: ${config.WEAVIATE_SCHEME}://${config.WEAVIATE_HOST}`);
  }

  async _ensureClassExists(projectId) {
    const className = getWeaviateClassName(projectId);
    try {
      const classObj = await this.client.schema.classGetter().withClassName(className).do();
      // Class exists
      if (!classObj.vectorizer === 'none') {
        console.warn(`Weaviate class ${className} exists but may not be configured for custom vectors (vectorizer is not 'none'). Ensure it's set up for manual vector input.`);
      }
      return true;
    } catch (err) {
      // Class does not exist, create it
      console.log(`Weaviate class ${className} does not exist. Attempting to create...`);
      const newClass = {
        class: className,
        description: `Stores asset vectors for project ${projectId}`,
        vectorizer: 'none', // Critical for manual vector input
        properties: [
          {
            name: 'assetId', // Our internal asset ID
            dataType: ['string'],
            description: 'The unique ID of the asset from our system.',
            tokenization: 'keyword', // Or 'word' if searching by assetId parts is needed
          },
          // We don't define a 'vector' property here as Weaviate handles it implicitly with vectorizer: 'none'
        ],
      };
      try {
        await this.client.schema.classCreator().withClass(newClass).do();
        console.log(`Weaviate class ${className} created successfully.`);
        return true;
      } catch (creationError) {
        console.error(`Failed to create Weaviate class ${className}:`, creationError.message, creationError.stack);
        throw new Error(`Failed to create Weaviate class ${className}: ${creationError.message}`);
      }
    }
  }

  /**
   * Weaviate uses its own UUIDs. To be able to delete/update by our assetId,
   * we need to fetch the Weaviate UUID associated with our assetId.
   */
  async _getWeaviateUUID(className, assetId) {
    try {
      const response = await this.client.graphql
        .get()
        .withClassName(className)
        .withFields('_additional { id }')
        .withWhere({
          operator: 'Equal',
          path: ['assetId'],
          valueString: assetId,
        })
        .withLimit(1)
        .do();

      if (response.data.Get[className] && response.data.Get[className].length > 0) {
        return response.data.Get[className][0]._additional.id;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching Weaviate UUID for assetId ${assetId} in class ${className}:`, error);
      throw error;
    }
  }


  async addAssetVector(projectId, assetId, vector) {
    const className = getWeaviateClassName(projectId);
    await this._ensureClassExists(projectId);

    const properties = {
      assetId: assetId,
    };

    // Check if object already exists by our assetId to decide on update vs create
    // Weaviate's create with a specified ID would update if it exists, but it requires Weaviate's UUID.
    // So, we manage our own "uniqueness" based on assetId.
    const weaviateUUID = await this._getWeaviateUUID(className, assetId);

    try {
      if (weaviateUUID) {
        // Update existing object's vector (and properties if needed)
        // Weaviate's update doesn't allow changing the vector directly in one go for an existing object
        // typically. The common pattern is delete and re-create if the vector needs to change,
        // or use a client version that supports vector updates if available.
        // For simplicity here, we'll delete and re-add.
        console.log(`WeaviateVectorStore: Asset ${assetId} found with UUID ${weaviateUUID}. Re-creating for update.`);
        await this.client.data.deleter()
            .withClassName(className)
            .withId(weaviateUUID)
            .do();
         // Fall through to create new object
      }

      // Create new object
      await this.client.data
        .creator()
        .withClassName(className)
        .withProperties(properties)
        .withVector(vector) // Manually specify the vector
        // .withId(weaviate.generateUuid5({ assetId, namespace: projectId })) // Optionally generate a consistent UUID
        .do();
      console.log(`WeaviateVectorStore: Added/Updated vector for asset ${assetId} in class ${className}`);
    } catch (error) {
      console.error(`WeaviateVectorStore: Error adding/updating vector for asset ${assetId} in class ${className}:`, error.message, error.stack);
      throw new Error(`Failed to add/update asset vector in Weaviate: ${error.message}`);
    }
  }

  async findSimilarAssets(projectId, queryVector, topN = 5) {
    const className = getWeaviateClassName(projectId);
    // No need to call _ensureClassExists here, as if it doesn't exist, query will fail gracefully or return no results.

    if (!queryVector || queryVector.length === 0) {
      console.error('WeaviateVectorStore: Query vector is undefined or empty.');
      return [];
    }

    try {
      const result = await this.client.graphql
        .get()
        .withClassName(className)
        .withFields('assetId _additional { id distance }') // Fetch our assetId and Weaviate's distance
        .withNearVector({ vector: queryVector })
        .withLimit(topN)
        .do();

      if (result.data.Get[className] && result.data.Get[className].length > 0) {
        console.log(`WeaviateVectorStore: Found ${result.data.Get[className].length} matches in class ${className}.`);
        return result.data.Get[className].map(item => item.assetId);
      } else {
        console.log(`WeaviateVectorStore: No matches found in class ${className}.`);
        return [];
      }
    } catch (error) {
      console.error(`WeaviateVectorStore: Error querying vectors in class ${className}:`, error.message, error.stack);
      // Check if class exists, if not, it's not an error per se, just no data.
      if (error.message && error.message.toLowerCase().includes("class") && error.message.toLowerCase().includes("does not exist")) {
        console.warn(`Weaviate class ${className} does not exist, returning empty results.`);
        return [];
      }
      throw new Error(`Failed to find similar assets in Weaviate: ${error.message}`);
    }
  }

  async removeAssetVector(projectId, assetId) {
    const className = getWeaviateClassName(projectId);

    const weaviateUUID = await this._getWeaviateUUID(className, assetId);
    if (!weaviateUUID) {
      console.log(`WeaviateVectorStore: Asset ${assetId} not found in class ${className}. Nothing to delete.`);
      return;
    }

    try {
      await this.client.data
        .deleter()
        .withClassName(className)
        .withId(weaviateUUID) // Weaviate requires its internal UUID for deletion
        .do();
      console.log(`WeaviateVectorStore: Deleted vector for asset ${assetId} (UUID: ${weaviateUUID}) from class ${className}`);
    } catch (error) {
      console.error(`WeaviateVectorStore: Error deleting vector for asset ${assetId} (UUID: ${weaviateUUID}) from class ${className}:`, error.message, error.stack);
      throw new Error(`Failed to remove asset vector from Weaviate: ${error.message}`);
    }
  }
}

module.exports = WeaviateVectorStore;
