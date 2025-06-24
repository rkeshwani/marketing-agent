require('dotenv').config()
// Configuration for the application

// IMPORTANT:
// If you store actual secrets (like API keys) in this file,
// YOU MUST add this file to your .gitignore to prevent committing them!
// A common practice is to use environment variables for secrets.
// You can use a .env file (add it to .gitignore) and the 'dotenv' package to load them.
// Example with dotenv: process.env.GEMINI_API_KEY

const config = {
  // Existing Gemini API configuration (presumably for chat/text generation)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE', // Placeholder
  GEMINI_API_ENDPOINT: process.env.GEMINI_API_ENDPOINT || 'YOUR_GEMINI_API_ENDPOINT_HERE', // Placeholder

  // Gemini Image API configuration
  GEMINI_IMAGE_API_KEY: process.env.GEMINI_IMAGE_API_KEY || '',
  GEMINI_IMAGE_API_ENDPOINT: process.env.GEMINI_IMAGE_API_ENDPOINT || 'https://placeholder.geminiapi.com/v1/images/generate', // Placeholder

  // Veo Video API configuration
  VEO_API_KEY: process.env.VEO_API_KEY || '',
  VEO_API_ENDPOINT: process.env.VEO_API_ENDPOINT || 'https://placeholder.veoapi.com/v2/videos/generate', // Placeholder

  // Embedding API configuration (for vectorService)
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || '',
  EMBEDDING_API_ENDPOINT: process.env.EMBEDDING_API_ENDPOINT || 'https://placeholder.embeddingapi.com/v1/embed', // Placeholder

  // Facebook App Access Token (for public searches or app-level actions)
  FACEBOOK_APP_ACCESS_TOKEN: process.env.FACEBOOK_APP_ACCESS_TOKEN || '',

  // Google Ads API Configuration
  GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
  GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH: process.env.GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH || '', // e.g., './ga_service_account.json'
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '', // ID of the manager or client account

  // LinkedIn App Configuration
  LINKEDIN_APP_ID: process.env.LINKEDIN_APP_ID || '',
  LINKEDIN_APP_SECRET: process.env.LINKEDIN_APP_SECRET || '',

  // Vector Store Configuration
  VECTOR_STORE_PROVIDER: process.env.VECTOR_STORE_PROVIDER || 'inMemory', // 'inMemory', 'pinecone', 'weaviate', 'chroma', 'faiss', 'pgvector'
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || '',
  // PINECONE_ENVIRONMENT: process.env.PINECONE_ENVIRONMENT || '', // For pod-based indexes; serverless doesn't strictly need it for basic ops.
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'my-default-index', // User should configure this

  WEAVIATE_SCHEME: process.env.WEAVIATE_SCHEME || 'http', // 'http' or 'https'
  WEAVIATE_HOST: process.env.WEAVIATE_HOST || 'localhost:8080', // e.g., 'localhost:8080' or 'your-weaviate-cluster.weaviate.network'
  WEAVIATE_API_KEY: process.env.WEAVIATE_API_KEY || '', // If using Weaviate Cloud Services (WCS) or API key auth
  WEAVIATE_CLASS_NAME_PREFIX: process.env.WEAVIATE_CLASS_NAME_PREFIX || 'ProjectAsset', // Prefix for Weaviate classes (projectId will be appended)

  CHROMA_PATH: process.env.CHROMA_PATH || '', // e.g., 'http://localhost:8000' for remote, or empty/path for local
  CHROMA_COLLECTION_NAME_PREFIX: process.env.CHROMA_COLLECTION_NAME_PREFIX || 'project-', // Prefix for collection names

  FAISS_INDEX_PATH: process.env.FAISS_INDEX_PATH || './faiss_indices', // Directory to store FAISS index files and mappings
  FAISS_DEFAULT_DIMENSION: parseInt(process.env.FAISS_DEFAULT_DIMENSION, 10) || 10, // Default dimension for embeddings

  PGVECTOR_CONNECTION_STRING: process.env.PGVECTOR_CONNECTION_STRING || '', // e.g., 'postgresql://user:password@host:port/database'
  PGVECTOR_TABLE_NAME_PREFIX: process.env.PGVECTOR_TABLE_NAME_PREFIX || 'project_vectors_', // Prefix for table names
  PGVECTOR_DEFAULT_DIMENSION: parseInt(process.env.PGVECTOR_DEFAULT_DIMENSION, 10) || 10, // Default dimension for embeddings

  // Add other configurations as needed
};

module.exports = config;
