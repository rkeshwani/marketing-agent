// src/services/toolRegistryService.js

const toolSchemas = [
  {
    name: "semantic_search_assets",
    description: "Performs a semantic search within the project's asset library based on a query.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for finding relevant assets."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "create_image_asset",
    description: "Generates an image using a DALL-E like model based on a textual prompt and saves it as a project asset.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The textual prompt to generate the image."
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "create_video_asset",
    description: "Generates a short video using a Veo 2 like model based on a textual prompt and saves it as a project asset.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The textual prompt to generate the video."
        }
      },
      required: ["prompt"]
    }
  }
];

/**
 * Retrieves the schema for a specific tool.
 * @param {string} toolName - The name of the tool.
 * @returns {object|null} The tool schema object, or null if not found.
 */
function getToolSchema(toolName) {
  const schema = toolSchemas.find(s => s.name === toolName);
  return schema || null;
}

/**
 * Retrieves a copy of all tool schemas.
 * @returns {Array<object>} An array of all tool schema objects.
 */
function getAllToolSchemas() {
  // Return a copy to prevent external modification of the original array
  return JSON.parse(JSON.stringify(toolSchemas));
}

module.exports = {
  getToolSchema,
  getAllToolSchemas,
  // Exporting toolSchemas directly might be useful for some scenarios,
  // but getter functions provide more control and safety.
  // toolSchemas
};
