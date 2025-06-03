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
  },
  {
    name: "facebook_managed_page_posts_search",
    description: "Searches posts on the Facebook Page linked to the current project. Results will be from the page associated with the project's Facebook credentials.",
    parameters: {
        type: "object",
        properties: {
            keywords: {
                type: "string",
                description: "Keywords to search for in the page posts. Optional."
            },
            startDate: {
                type: "string",
                description: "Start date for search range (e.g., YYYY-MM-DD). Optional."
            },
            endDate: {
                type: "string",
                description: "End date for search range (e.g., YYYY-MM-DD). Optional."
            }
        },
        required: []
    }
  },
  {
    name: "facebook_public_posts_search",
    description: "Searches public Facebook posts. Useful for competitor research or general public content discovery.",
    parameters: {
        type: "object",
        properties: {
            keywords: {
                type: "string",
                description: "Keywords to search for in public posts."
            },
            targetPublicPageIdOrName: {
                type: "string",
                description: "The ID or name of a specific public Facebook Page to search within. Optional."
            }
        },
        required: ["keywords"]
    }
  },
  {
    name: "tiktok_public_posts_search",
    description: "Searches public TikTok posts by keywords or hashtags.",
    parameters: {
        type: "object",
        properties: {
            keywordsOrHashtags: {
                type: "string",
                description: "Keywords or hashtags (e.g., #funnycats) to search for in public TikTok posts."
            }
        },
        required: ["keywordsOrHashtags"]
    }
  },
  {
    name: "facebook_create_post",
    description: "Creates a new post on the linked Facebook Page. Can include text, and optionally one image asset OR one video asset from the project library. Do not provide both an image and a video asset ID.",
    parameters: {
        type: "object",
        properties: {
            text_content: {
                type: "string",
                description: "The main text content for the Facebook post."
            },
            image_asset_id: {
                type: "string",
                description: "ID of an image asset from the project library to attach to the post. Optional. Do not use if video_asset_id is provided."
            },
            video_asset_id: {
                type: "string",
                description: "ID of a video asset from the project library to attach to the post. Optional. Do not use if image_asset_id is provided."
            }
        },
        required: ["text_content"]
    }
  },
  {
    name: "tiktok_create_post",
    description: "Creates a new post on the linked TikTok account. Requires a video asset from the project library and can include optional text content.",
    parameters: {
        type: "object",
        properties: {
            video_asset_id: {
                type: "string",
                description: "ID of a video asset from the project library to be posted on TikTok."
            },
            text_content: {
                type: "string",
                description: "The caption or text content for the TikTok post. Optional."
            }
        },
        required: ["video_asset_id"]
    }
  },
  {
    name: "google_ads_create_campaign_scaffold",
    description: "Initiates the creation of a Google Ads campaign. Most details (targeting, bidding, etc.) will be derived from project context by the agent or by asking the user. Budget will be requested during execution.",
    parameters: {
        type: "object",
        properties: {
            campaign_name_suggestion: {
                type: "string",
                description: "An optional name suggestion for the campaign. If not provided, a name will be generated."
            },
            campaign_type_suggestion: {
                type: "string",
                description: "An optional suggestion for the campaign type (e.g., 'Search', 'Display', 'Performance Max'). Defaults to 'Search' if not provided or if context is unclear."
            }
        },
        required: []
    }
  },
  {
    name: "google_ads_create_ad_group_scaffold",
    description: "Initiates the creation of an Ad Group within a specified Google Ads campaign. Keywords, bids, and other details will be derived from project context or by asking the user.",
    parameters: {
        type: "object",
        properties: {
            campaign_id: {
                type: "string",
                description: "The ID of the Google Ads campaign this ad group will belong to."
            },
            ad_group_name_suggestion: {
                type: "string",
                description: "An optional name suggestion for the ad group. If not provided, a name will be generated."
            }
        },
        required: ["campaign_id"]
    }
  },
  {
    name: "google_ads_create_ad_scaffold",
    description: "Initiates the creation of an Ad within a specified Google Ads ad group. Ad copy (headlines, descriptions) and other details will be derived from project context or by asking the user.",
    parameters: {
        type: "object",
        properties: {
            ad_group_id: {
                type: "string",
                description: "The ID of the Google Ads ad group this ad will belong to."
            },
            ad_type_suggestion: {
                type: "string",
                description: "An optional suggestion for the ad type (e.g., 'TEXT_AD', 'RESPONSIVE_SEARCH_AD', 'RESPONSIVE_DISPLAY_AD'). Defaults to a suitable type if not provided."
            }
        },
        required: ["ad_group_id"]
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
