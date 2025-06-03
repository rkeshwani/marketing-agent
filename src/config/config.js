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

  // New: Gemini Image API configuration
  GEMINI_IMAGE_API_KEY: process.env.GEMINI_IMAGE_API_KEY || '',
  GEMINI_IMAGE_API_ENDPOINT: process.env.GEMINI_IMAGE_API_ENDPOINT || 'https://placeholder.geminiapi.com/v1/images/generate', // Placeholder

  // New: Veo Video API configuration
  VEO_API_KEY: process.env.VEO_API_KEY || '',
  VEO_API_ENDPOINT: process.env.VEO_API_ENDPOINT || 'https://placeholder.veoapi.com/v2/videos/generate', // Placeholder

  // New: Embedding API configuration (for vectorService)
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || '',
  EMBEDDING_API_ENDPOINT: process.env.EMBEDDING_API_ENDPOINT || 'https://placeholder.embeddingapi.com/v1/embed', // Placeholder

  // Add other configurations as needed
};

module.exports = config;
