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
  VECTOR_STORE_PROVIDER: process.env.VECTOR_STORE_PROVIDER || 'inMemory', // 'inMemory', 'pinecone', 'database', etc.

  // Add other configurations as needed
};

module.exports = config;
