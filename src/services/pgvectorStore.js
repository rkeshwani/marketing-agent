// src/services/pgvectorStore.js
const { Pool } = require('pg');
const VectorStoreInterface = require('./vectorStoreInterface');
const config = require('../config/config');

// pgvector uses array format like '[1,2,3]' for vectors
function formatVectorForPg(vector) {
  return `[${vector.join(',')}]`;
}

// Table names should be sanitized to prevent SQL injection if projectId comes from untrusted sources,
// though here it's mostly for valid character sets.
// PostgreSQL identifiers are typically lowercase unless quoted.
function getPgvectorTableName(projectId) {
  if (!projectId) {
    throw new Error("ProjectId is required to determine pgvector table name.");
  }
  const sanitizedProjectId = projectId.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
  if (sanitizedProjectId.length === 0) throw new Error("Invalid ProjectId for table name after sanitization.");
  return `${config.PGVECTOR_TABLE_NAME_PREFIX}${sanitizedProjectId}`;
}


class PgvectorStore extends VectorStoreInterface {
  constructor() {
    super();
    if (!config.PGVECTOR_CONNECTION_STRING) {
      throw new Error('PostgreSQL connection string (PGVECTOR_CONNECTION_STRING) is not configured.');
    }
    this.pool = new Pool({ connectionString: config.PGVECTOR_CONNECTION_STRING });
    this.dimension = config.PGVECTOR_DEFAULT_DIMENSION;

    this.pool.on('error', (err, client) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
      // process.exit(-1); // Or handle more gracefully
    });

    console.log(`PgvectorStore initialized. Table prefix: ${config.PGVECTOR_TABLE_NAME_PREFIX}, Dimension: ${this.dimension}`);
    this._ensureVectorExtension();
  }

  async _ensureVectorExtension() {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      console.log('pgvector: Vector extension checked/ensured.');
    } catch (err) {
      console.error('pgvector: Failed to ensure vector extension exists. Manual setup might be required.', err);
      // Depending on policy, might re-throw or just warn.
    } finally {
      client.release();
    }
  }

  async _ensureTableExists(projectId) {
    const tableName = getPgvectorTableName(projectId);
    const client = await this.pool.connect();
    try {
      // IMPORTANT: Table and column names should NOT be directly from user input without strict sanitization.
      // Here, getPgvectorTableName provides some sanitization.
      // The dimension is from config.
      const queryText = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          asset_id TEXT PRIMARY KEY,
          embedding VECTOR(${this.dimension})
        );
      `;
      await client.query(queryText);
      console.log(`pgvector: Table "${tableName}" checked/ensured for dimension ${this.dimension}.`);

      // Optionally, create an index for faster similarity search after table creation
      // Example: CREATE INDEX ON "${tableName}" USING hnsw (embedding vector_l2_ops);
      // This is an advanced setup and depends on the expected size and query patterns.
      // For now, we'll rely on sequential scans or whatever default pgvector provides.
    } catch (err) {
      console.error(`pgvector: Error ensuring table "${tableName}" exists:`, err);
      throw err; // Re-throw to be handled by the calling method
    } finally {
      client.release();
    }
  }

  async addAssetVector(projectId, assetId, vector) {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension ${vector.length} does not match pgvector table dimension ${this.dimension}`);
    }
    await this._ensureTableExists(projectId);
    const tableName = getPgvectorTableName(projectId);
    const formattedVector = formatVectorForPg(vector);

    const queryText = `
      INSERT INTO "${tableName}" (asset_id, embedding)
      VALUES ($1, $2)
      ON CONFLICT (asset_id) DO UPDATE
      SET embedding = EXCLUDED.embedding;
    `;

    const client = await this.pool.connect();
    try {
      await client.query(queryText, [assetId, formattedVector]);
      console.log(`pgvector: Added/Updated vector for asset ${assetId} in table "${tableName}"`);
    } catch (error) {
      console.error(`pgvector: Error adding/updating vector for asset ${assetId} in "${tableName}":`, error);
      throw new Error(`Failed to add asset vector to pgvector: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async findSimilarAssets(projectId, queryVector, topN = 5) {
    if (queryVector.length !== this.dimension) {
      throw new Error(`Query vector dimension ${queryVector.length} does not match pgvector table dimension ${this.dimension}`);
    }
    // No need to ensure table exists here; if it doesn't, the query will fail, which is acceptable.
    const tableName = getPgvectorTableName(projectId);
    const formattedQueryVector = formatVectorForPg(queryVector);

    // Using L2 distance (<->). Other operators: <#> for inner product, <=> for cosine distance.
    const queryText = `
      SELECT asset_id FROM "${tableName}"
      ORDER BY embedding <-> $1
      LIMIT $2;
    `;

    const client = await this.pool.connect();
    try {
      const res = await client.query(queryText, [formattedQueryVector, topN]);
      console.log(`pgvector: Found ${res.rows.length} matches in table "${tableName}".`);
      return res.rows.map(row => row.asset_id);
    } catch (error) {
      console.error(`pgvector: Error querying vectors in table "${tableName}":`, error);
      if (error.message && error.message.includes("does not exist")) { // Relation does not exist
        console.warn(`pgvector: Table "${tableName}" does not exist. Returning empty results.`);
        return [];
      }
      throw new Error(`Failed to find similar assets in pgvector: ${error.message}`);
    } finally {
      client.release();
    }
  }

  async removeAssetVector(projectId, assetId) {
    // No need to ensure table exists here. If it doesn't, DELETE does nothing or errors, which is fine.
    const tableName = getPgvectorTableName(projectId);
    const queryText = `DELETE FROM "${tableName}" WHERE asset_id = $1;`;

    const client = await this.pool.connect();
    try {
      const res = await client.query(queryText, [assetId]);
      if (res.rowCount > 0) {
        console.log(`pgvector: Deleted vector for asset ${assetId} from table "${tableName}"`);
      } else {
        console.log(`pgvector: Asset ${assetId} not found in table "${tableName}". Nothing to delete.`);
      }
    } catch (error) {
      console.error(`pgvector: Error deleting vector for asset ${assetId} from "${tableName}":`, error);
      if (error.message && error.message.includes("does not exist")) { // Relation does not exist
        console.warn(`pgvector: Table "${tableName}" does not exist. Nothing to delete.`);
        return;
      }
      throw new Error(`Failed to remove asset vector from pgvector: ${error.message}`);
    } finally {
      client.release();
    }
  }

  // Call this when the application is shutting down to close the pool.
  async closePool() {
    console.log('pgvector: Closing connection pool.');
    await this.pool.end();
  }
}

module.exports = PgvectorStore;
