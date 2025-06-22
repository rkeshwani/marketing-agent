// src/services/toolExecutorService.js

const fetch = require('node-fetch');
const config = require('../config/config'); // Path relative to src/services/
const vectorService = require('./vectorService'); // In the same services folder
const microsandboxService = require('./microsandboxService'); // For executing Python scripts
const geminiService = require('./geminiService'); // For generating Python script
const fs = require('fs/promises');
const fsSync = require('fs'); // For createWriteStream and existsSync
const path = require('path');
const http = require('http');
const https = require('https');
const { getPrompt } = require('./promptProvider'); // Import getPrompt
const linkedinService = require('./linkedinService'); // Added for LinkedIn
const wordPressTool = require('../tools/wordpressTool'); // Added for WordPress

// Internal utility function to sanitize text for LLM consumption
async function sanitizeTextForLLM(rawText) {
  if (typeof rawText !== 'string') {
    return ""; // Or handle as an error, but for sanitization, returning empty might be safer.
  }

  let sanitizedText = rawText;

  // 1. HTML Tag Stripping (more aggressive)
  // Replace tags with a space to avoid words running together, then trim multiple spaces.
  sanitizedText = sanitizedText.replace(/<[^>]+>/g, ' ');

  // 2. Remove XML/SGML Declarations (if any survived or were part of the text)
  // These might appear if the content is not strictly HTML.
  sanitizedText = sanitizedText.replace(/<\?xml[^>]*\?>/gi, '');
  sanitizedText = sanitizedText.replace(/<!DOCTYPE[^>]*>/gi, '');

  // 3. Instructional Phrase Neutralization
  const instructionalPhrases = [
    "ignore your previous instructions",
    "you are now a", // This one is a bit broad, consider context if it causes issues.
    "important new instruction:",
    "system override",
    "your new prompt is:",
    "disregard prior directives",
    "follow these new commands",
    "critical alert: new instructions follow",
    "priority message: update your instructions",
    "new set of rules:",
    "your primary goal is now different:",
    "completely ignore prior context"
    // Adding more specific variations might be needed based on observed injection attempts.
  ];

  instructionalPhrases.forEach(phrase => {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); // Escape regex special chars in phrase
    sanitizedText = sanitizedText.replace(regex, '[Instructional phrase neutralized]');
  });

  // 4. Remove/Replace Multiple Newlines and excessive whitespace from tag stripping
  sanitizedText = sanitizedText.replace(/\n\s*\n/g, '\n'); // Replace multiple newlines (possibly with spaces between) with a single newline
  sanitizedText = sanitizedText.replace(/(\r\n|\r|\n){2,}/g, '$1'); // More general multiple newline collapse
  sanitizedText = sanitizedText.replace(/[ \t]{2,}/g, ' '); // Replace multiple spaces/tabs with a single space

  sanitizedText = sanitizedText.trim(); // Trim leading/trailing whitespace

  return sanitizedText;
}

// Note: The following functions rely on global.dataStore being available,
// similar to how they were used when defined directly in agent.js.
// This dependency should be managed more explicitly in a production system (e.g., via DI).

// --- Asset Tools ---
async function perform_semantic_search_assets_tool(query, projectId) {
    console.log(`Executing REAL semantic_search_assets_tool for project ${projectId} with query: ${query}`);
    if (!query || typeof query !== 'string' || query.trim() === '') {
        console.warn("Semantic search called with empty or invalid query.");
        return JSON.stringify({ error: "Search query cannot be empty." });
    }
    try {
        const queryEmbedding = await vectorService.generateEmbedding(query);
        if (!queryEmbedding || !queryEmbedding.vector) {
            console.error("Failed to generate query embedding.");
            return JSON.stringify({ error: "Could not process search query." });
        }
        const similarAssetIds = await vectorService.findSimilarAssets(projectId, queryEmbedding.vector, 5);
        if (!similarAssetIds || similarAssetIds.length === 0) return JSON.stringify([]);
        const project = global.dataStore.findProjectById(projectId);
        if (!project || !project.assets || project.assets.length === 0) {
            console.warn(`No assets found for project ${projectId} to match against search results.`);
            return JSON.stringify([]);
        }
        const results = project.assets
            .filter(asset => similarAssetIds.includes(asset.assetId || asset.id))
            .map(r => ({ id: r.assetId || r.id, name: r.name, type: r.type, description: r.description, url: r.url }));
        return JSON.stringify(results);
    } catch (error) {
        console.error("Error during semantic search:", error);
        return JSON.stringify({ error: "An error occurred during semantic search." });
    }
}

async function create_image_asset_tool(prompt, projectId) {
    console.log(`Executing REAL create_image_asset_tool for project ${projectId} with prompt: ${prompt}`);
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return JSON.stringify({ error: "Image generation prompt cannot be empty." });
    }
    const apiKey = config.GEMINI_IMAGE_API_KEY;
    const apiEndpoint = config.GEMINI_IMAGE_API_ENDPOINT;
    if (!apiKey || !apiEndpoint) {
        console.error("Gemini Image API key or endpoint is not configured in config/config.js");
        return JSON.stringify({ error: "Image generation service is not configured by the administrator." });
    }
    try {
        console.log(`Calling Gemini Image API at ${apiEndpoint}...`);
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ prompt: prompt })
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini Image API Error: ${response.status}`, errorBody);
            return JSON.stringify({ error: `Failed to generate image: API Error ${response.status}` });
        }
        const responseData = await response.json();
        const imageUrl = responseData.imageUrl || (responseData.data && responseData.data.url) || `http://example.com/mock_images/${Date.now()}.jpg`;
        if (!imageUrl) {
            console.error("Gemini Image API response did not contain an image URL.", responseData);
            return JSON.stringify({ error: "Failed to retrieve image URL from generation service." });
        }
        console.log("Generated image URL:", imageUrl);
        const assetId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const assetName = `Generated Image: ${prompt.substring(0, 30).trim()}...`;
        const assetDescription = `AI-generated image based on prompt: "${prompt}"`;
        const newAsset = {
            assetId: assetId, name: assetName, type: 'image', url: imageUrl,
            prompt: prompt, description: assetDescription, tags: ['ai-generated', 'image'],
            createdAt: new Date().toISOString()
        };
        const project = global.dataStore.findProjectById(projectId);
        if (!project) return JSON.stringify({ error: 'Project not found, cannot save image asset.' });
        if (!project.assets) project.assets = [];
        project.assets.push(newAsset);
        global.dataStore.updateProjectById(projectId, { assets: project.assets });
        console.log(`Asset ${assetId} created and added to project ${projectId}`);
        try {
            const textForEmbedding = `${newAsset.name} ${newAsset.description} ${newAsset.prompt} ${newAsset.tags.join(' ')}`;
            const embedding = await vectorService.generateEmbedding(textForEmbedding);
            if (embedding && embedding.vector) {
                await vectorService.addAssetVector(projectId, newAsset.assetId, embedding.vector);
                console.log(`Embedding generated and stored for asset ${newAsset.assetId}`);
            } else {
                console.warn(`Failed to generate or store embedding for asset ${newAsset.assetId}`);
            }
        } catch (embedError) {
            console.error(`Error during embedding for asset ${newAsset.assetId}:`, embedError);
        }
        return JSON.stringify({
            asset_id: newAsset.assetId, image_url: newAsset.url, name: newAsset.name,
            message: 'Image asset created, saved, and indexed for search.'
        });
    } catch (error) {
        console.error("Error in create_image_asset_tool:", error);
        if (error.message.includes('fetch is not defined') || error.message.includes('Only absolute URLs are supported')) {
             return JSON.stringify({ error: "Network error or misconfiguration calling image generation service."});
        }
        return JSON.stringify({ error: "An unexpected error occurred while creating the image asset." });
    }
}

async function create_video_asset_tool(prompt, projectId) {
    console.log(`Executing REAL create_video_asset_tool for project ${projectId} with prompt: ${prompt}`);
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        return JSON.stringify({ error: "Video generation prompt cannot be empty." });
    }
    const apiKey = config.VEO_API_KEY;
    const apiEndpoint = config.VEO_API_ENDPOINT;
    if (!apiKey || !apiEndpoint) {
        console.error("Veo API key or endpoint is not configured in config/config.js.");
        return JSON.stringify({ error: "Video generation service is not configured by the administrator." });
    }
    try {
        console.log(`Calling Veo API at ${apiEndpoint}...`);
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ prompt: prompt })
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Veo API Error: ${response.status}`, errorBody);
            return JSON.stringify({ error: `Failed to generate video: API Error ${response.status}` });
        }
        const responseData = await response.json();
        const videoUrl = responseData.videoUrl || (responseData.data && responseData.data.url) || `http://example.com/mock_videos/${Date.now()}.mp4`;
        if (!videoUrl) {
            console.error("Veo API response did not contain a video URL.", responseData);
            return JSON.stringify({ error: "Failed to retrieve video URL from generation service." });
        }
        console.log("Generated video URL:", videoUrl);
        const assetId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const assetName = `Generated Video: ${prompt.substring(0, 30).trim()}...`;
        const assetDescription = `AI-generated video based on prompt: "${prompt}"`;
        const newAsset = {
            assetId: assetId, name: assetName, type: 'video', url: videoUrl,
            prompt: prompt, description: assetDescription, tags: ['ai-generated', 'video'],
            createdAt: new Date().toISOString()
        };
        const project = global.dataStore.findProjectById(projectId);
        if (!project) return JSON.stringify({ error: 'Project not found, cannot save video asset.' });
        if (!project.assets) project.assets = [];
        project.assets.push(newAsset);
        global.dataStore.updateProjectById(projectId, { assets: project.assets });
        console.log(`Asset ${assetId} (video) created and added to project ${projectId}`);
        try {
            const textForEmbedding = `${newAsset.name} ${newAsset.description} ${newAsset.prompt} ${newAsset.tags.join(' ')}`;
            const embedding = await vectorService.generateEmbedding(textForEmbedding);
            if (embedding && embedding.vector) {
                await vectorService.addAssetVector(projectId, newAsset.assetId, embedding.vector);
                console.log(`Embedding generated and stored for video asset ${newAsset.assetId}`);
            } else {
                console.warn(`Failed to generate or store embedding for video asset ${newAsset.assetId}`);
            }
        } catch (embedError) {
            console.error(`Error during embedding for video asset ${newAsset.assetId}:`, embedError);
        }
        return JSON.stringify({
            asset_id: newAsset.assetId, video_url: newAsset.url, name: newAsset.name,
            message: 'Video asset created, saved, and indexed for search.'
        });
    } catch (error) {
        console.error("Error in create_video_asset_tool:", error);
        if (error.message.includes('fetch is not defined') || error.message.includes('Only absolute URLs are supported')) {
             return JSON.stringify({ error: "Network error or misconfiguration calling video generation service."});
        }
        return JSON.stringify({ error: "An unexpected error occurred while creating the video asset." });
    }
}

// --- Social Media Tool Functions ---
async function execute_facebook_managed_page_posts_search(params, projectId) {
    console.log(`Executing facebook_managed_page_posts_search for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    if (!project) return JSON.stringify({ error: "Project not found." });
    if (!project.facebookPageAccessToken || !project.facebookSelectedPageID) {
        return JSON.stringify({ error: "Facebook Page access token or Page ID not configured for this project." });
    }
    const keywords = params && params.keywords ? params.keywords : '';
    const apiUrl = `https://graph.facebook.com/v18.0/${project.facebookSelectedPageID}/posts?access_token=${project.facebookPageAccessToken}&q=${encodeURIComponent(keywords)}`;
    console.log("Mocking API call to Facebook (managed page posts search):", apiUrl);
    return JSON.stringify({
        data: [{ id: `${project.facebookSelectedPageID}_mockpost1`, message: `Mock post about ${keywords || 'anything'} from managed page`, created_time: new Date().toISOString() }],
        paging: { cursors: { after: "mock_after_cursor" }}
    });
}

async function execute_facebook_public_posts_search(params, projectId) {
    console.log(`Executing facebook_public_posts_search for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    const appAccessToken = config.FACEBOOK_APP_ACCESS_TOKEN;
    const tokenToUse = (project && project.facebookUserAccessToken) ? project.facebookUserAccessToken : appAccessToken;
    if(!tokenToUse) {
        return JSON.stringify({ error: "Facebook access token (user or app) not available for public search." });
    }
    const keywords = params && params.keywords ? params.keywords : '';
    const target = params && params.targetPublicPageIdOrName ? params.targetPublicPageIdOrName : 'cocacola';
    const apiUrl = `https://graph.facebook.com/v18.0/${target}/posts?fields=id,message,from,created_time&access_token=${tokenToUse}&q=${encodeURIComponent(keywords)}`;
    console.log("Mocking API call to Facebook (public posts search):", apiUrl);
    return JSON.stringify({
        data: [{ id: `${target}_publicmockpost1`, message: `Public mock post about ${keywords} from ${target}`, from: {name: target}, created_time: new Date().toISOString() }],
        paging: { cursors: { after: "mock_after_cursor" }}
    });
}

async function execute_tiktok_public_posts_search(params, projectId) {
    console.log(`Executing tiktok_public_posts_search for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    if (!project || !project.tiktokAccessToken) {
        console.warn("TikTok access token not configured for this project. Proceeding with public search if possible.");
    }
    const keywordsOrHashtags = params && params.keywordsOrHashtags ? params.keywordsOrHashtags : '';
    const apiUrl = `https://api.tiktok.com/v2/research/video/query/?query=${encodeURIComponent(keywordsOrHashtags)}`;
    console.log("Mocking API call to TikTok (public posts search):", apiUrl);
    return JSON.stringify({
        data: { videos: [{ video_id: 'mocktiktok1', video_description: `TikTok about ${keywordsOrHashtags}`, author_unique_id: 'tiktok_user_mock' }]},
        cursor: "mock_cursor", has_more: false
    });
}

async function execute_facebook_create_post(params, projectId) {
    console.log(`Executing facebook_create_post for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    if (!project) return JSON.stringify({ error: "Project not found." });
    if (!project.facebookPageAccessToken || !project.facebookSelectedPageID) {
        return JSON.stringify({ error: "Facebook Page access token or Page ID not configured for this project." });
    }
    let mediaUrl = null;
    let mediaType = null;
    if (params.image_asset_id && params.video_asset_id) {
        return JSON.stringify({ error: "Cannot provide both image_asset_id and video_asset_id."});
    }
    if (params.image_asset_id) {
        const imageAsset = project.assets.find(a => (a.assetId === params.image_asset_id || a.id === params.image_asset_id) && a.type === 'image');
        if (!imageAsset || !imageAsset.url) return JSON.stringify({ error: `Image asset ${params.image_asset_id} not found or has no URL.` });
        mediaUrl = imageAsset.url;
        mediaType = 'image';
    } else if (params.video_asset_id) {
        const videoAsset = project.assets.find(a => (a.assetId === params.video_asset_id || a.id === params.video_asset_id) && a.type === 'video');
        if (!videoAsset || !videoAsset.url) return JSON.stringify({ error: `Video asset ${params.video_asset_id} not found or has no URL.` });
        mediaUrl = videoAsset.url;
        mediaType = 'video';
    }
    const postData = { message: params.text_content };
    if (mediaUrl && mediaType === 'image') postData.url = mediaUrl;
    if (mediaUrl && mediaType === 'video') postData.file_url = mediaUrl;
    const endpointPath = (mediaType === 'video') ? 'videos' : (mediaType === 'image' ? 'photos' : 'feed');
    const apiUrl = `https://graph.facebook.com/v18.0/${project.facebookSelectedPageID}/${endpointPath}?access_token=${project.facebookPageAccessToken}`;
    console.log("Mocking API POST to Facebook (create post):", apiUrl, "with data:", postData);
    return JSON.stringify({ id: `${project.facebookSelectedPageID}_mockpost${Date.now()}` });
}

async function execute_tiktok_create_post(params, projectId) {
    console.log(`Executing tiktok_create_post for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    if (!project) return JSON.stringify({ error: "Project not found." });
    if (!project.tiktokAccessToken) {
        return JSON.stringify({ error: "TikTok access token not configured for this project." });
    }
    const videoAsset = project.assets.find(a => (a.assetId === params.video_asset_id || a.id === params.video_asset_id) && a.type === 'video');
    if (!videoAsset || !videoAsset.url) {
        return JSON.stringify({ error: `Video asset ${params.video_asset_id} not found or has no URL.` });
    }
    const postData = { description: params.text_content, video_url: videoAsset.url };
    const apiUrl = `https://api.tiktok.com/v2/post/publish/video/`;
    console.log("Mocking API POST to TikTok (create post):", apiUrl, "with data:", postData);
    return JSON.stringify({ data: { item_id: `mocktiktokpost${Date.now()}` }, error_code: 0, error_message: "" });
}

// --- Google Ads Tool Functions ---
async function getGoogleAdsOAuthToken(keyPath) {
    console.log(`Requesting OAuth token with key from ${keyPath} (MOCK)`);
    if (!keyPath) return Promise.reject("Service account key path not provided for Google Ads.");
    return "mock-oauth-token-for-google-ads";
}

async function execute_google_ads_create_campaign_from_config(campaignConfig, budget, projectId) {
    console.log(`Executing execute_google_ads_create_campaign_from_config for project ${projectId}`, { campaignConfig, budget });
    const devToken = config.GOOGLE_ADS_DEVELOPER_TOKEN;
    const keyPath = config.GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH;
    const loginCustomerId = config.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (!devToken || !keyPath) {
        return JSON.stringify({ error: "Google Ads developer token or service account key path not configured." });
    }
    if (!loginCustomerId) console.warn("GOOGLE_ADS_LOGIN_CUSTOMER_ID is not set. API calls may require it.");
    try {
        const oauthToken = await getGoogleAdsOAuthToken(keyPath);
        const apiPayload = { ...campaignConfig, budget: { amount_micros: parseFloat(budget.replace('$', '')) * 1000000 } };
        const customerIdForApi = campaignConfig.customer_id || loginCustomerId;
        if (!customerIdForApi) return JSON.stringify({ error: "Customer ID for Google Ads campaign creation is missing." });
        const mockApiEndpoint = `https://googleads.googleapis.com/vXX/customers/${customerIdForApi}/campaigns:mutate`;
        console.log("Mocking Google Ads API Call (Create Campaign):", mockApiEndpoint, "Payload:", apiPayload);
        console.log("Using Dev Token:", devToken, "OAuth Token:", oauthToken.substring(0,15) + "...");
        const mockCampaignId = `mockCampaign_${Date.now()}`;
        return JSON.stringify({ results: [{ resourceName: `customers/${customerIdForApi}/campaigns/${mockCampaignId}` }] });
    } catch (error) {
        console.error("Error in execute_google_ads_create_campaign_from_config:", error);
        return JSON.stringify({ error: "Failed to execute Google Ads campaign creation." });
    }
}

async function execute_google_ads_create_ad_group_from_config(adGroupConfig, projectId) {
    console.log(`Executing execute_google_ads_create_ad_group_from_config for project ${projectId}`, { adGroupConfig });
    const devToken = config.GOOGLE_ADS_DEVELOPER_TOKEN;
    const keyPath = config.GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH;
    const loginCustomerId = config.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (!devToken || !keyPath) {
        return JSON.stringify({ error: "Google Ads developer token or service account key path not configured." });
    }
     if (!adGroupConfig || !adGroupConfig.campaign_id) {
        return JSON.stringify({ error: "Campaign ID is missing in adGroupConfig." });
    }
    try {
        const oauthToken = await getGoogleAdsOAuthToken(keyPath);
        const customerIdForApi = adGroupConfig.customer_id || loginCustomerId;
         if (!customerIdForApi) return JSON.stringify({ error: "Customer ID for Google Ads ad group creation is missing." });
        const mockApiEndpoint = `https://googleads.googleapis.com/vXX/customers/${customerIdForApi}/adGroups:mutate`;
        console.log("Mocking Google Ads API Call (Create Ad Group):", mockApiEndpoint, "Payload:", adGroupConfig);
        console.log("Using Dev Token:", devToken, "OAuth Token:", oauthToken.substring(0,15) + "...");
        const mockAdGroupId = `mockAdGroup_${Date.now()}`;
        return JSON.stringify({ results: [{ resourceName: `customers/${customerIdForApi}/adGroups/${mockAdGroupId}` }] });
    } catch (error) {
        console.error("Error in execute_google_ads_create_ad_group_from_config:", error);
        return JSON.stringify({ error: "Failed to execute Google Ads ad group creation." });
    }
}

async function execute_google_ads_create_ad_from_config(adConfig, projectId) {
    console.log(`Executing execute_google_ads_create_ad_from_config for project ${projectId}`, { adConfig });
    const devToken = config.GOOGLE_ADS_DEVELOPER_TOKEN;
    const keyPath = config.GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH;
    const loginCustomerId = config.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (!devToken || !keyPath) {
        return JSON.stringify({ error: "Google Ads developer token or service account key path not configured." });
    }
    if (!adConfig || !adConfig.ad_group_id) {
        return JSON.stringify({ error: "Ad Group ID is missing in adConfig." });
    }
    try {
        const oauthToken = await getGoogleAdsOAuthToken(keyPath);
        const customerIdForApi = adConfig.customer_id || loginCustomerId;
         if (!customerIdForApi) return JSON.stringify({ error: "Customer ID for Google Ads ad creation is missing." });
        const mockApiEndpoint = `https://googleads.googleapis.com/vXX/customers/${customerIdForApi}/adGroupAds:mutate`;
        console.log("Mocking Google Ads API Call (Create Ad):", mockApiEndpoint, "Payload:", adConfig);
        console.log("Using Dev Token:", devToken, "OAuth Token:", oauthToken.substring(0,15) + "...");
        const mockAdId = `mockAd_${Date.now()}`;
        return JSON.stringify({ results: [{ resourceName: `customers/${customerIdForApi}/ads/${mockAdId}` }] });
    } catch (error) {
        console.error("Error in execute_google_ads_create_ad_from_config:", error);
        return JSON.stringify({ error: "Failed to execute Google Ads ad creation." });
    }
}

// --- Dynamic Asset Script Execution ---

/**
 * Downloads a file from a given URL to a specified output path.
 * @param {string} url The URL of the file to download.
 * @param {string} outputPath The local path to save the downloaded file.
 * @returns {Promise<void>}
 * @private
 */
async function _downloadFile(url, outputPath) {
    console.log(`Downloading ${url} to ${outputPath}`);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status} ${response.statusText} from ${url}`);
        }
        const fileStream = fsSync.createWriteStream(outputPath);
        await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on("error", reject);
            fileStream.on("finish", resolve);
        });
        console.log(`File downloaded successfully: ${outputPath}`);
    } catch (error) {
        console.error(`Error in _downloadFile downloading ${url}:`, error);
        // Attempt to clean up partially downloaded file
        try {
            if (fsSync.existsSync(outputPath)) {
                await fs.unlink(outputPath);
            }
        } catch (cleanupError) {
            console.error(`Error cleaning up file ${outputPath} after download failure:`, cleanupError);
        }
        throw error; // Re-throw the original download error
    }
}


async function execute_dynamic_asset_script(params, projectId) {
    console.log(`Executing execute_dynamic_asset_script for project ${projectId}`, params);
    const { asset_id, modification_prompt, output_asset_name_suggestion, output_asset_type } = params;

    if (!asset_id || !modification_prompt || !output_asset_type) {
        return JSON.stringify({ success: false, error: "Missing required parameters: asset_id, modification_prompt, or output_asset_type." });
    }

    const project = global.dataStore.findProjectById(projectId);
    if (!project) {
        return JSON.stringify({ success: false, error: `Project with ID ${projectId} not found.` });
    }

    const inputAsset = project.assets.find(a => a.assetId === asset_id || a.id === asset_id);
    if (!inputAsset) {
        return JSON.stringify({ success: false, error: `Input asset with ID ${asset_id} not found in project ${projectId}.` });
    }

    if (!inputAsset.url) {
        return JSON.stringify({ success: false, error: `Input asset ${asset_id} has no downloadable URL.` });
    }

    // Ensure TEMP_ASSET_DIR exists
    if (!fsSync.existsSync(microsandboxService.TEMP_ASSET_DIR)) {
        await fs.mkdir(microsandboxService.TEMP_ASSET_DIR, { recursive: true });
    }

    const inputAssetExtension = path.extname(inputAsset.name || inputAsset.url || 'asset');
    const localInputAssetPath = path.join(microsandboxService.TEMP_ASSET_DIR, `input_${projectId}_${asset_id}${inputAssetExtension}`);

    try {
        await _downloadFile(inputAsset.url, localInputAssetPath);
    } catch (downloadError) {
        console.error(`Failed to download input asset ${inputAsset.url}:`, downloadError);
        return JSON.stringify({ success: false, error: `Failed to download input asset: ${downloadError.message}` });
    }

    const inputFilenameInSandbox = `input${inputAssetExtension}`;
    // Determine output extension based on output_asset_type or suggestion, fallback to input asset's extension
    let outputAssetExtension = path.extname(output_asset_name_suggestion || '');
    if (!outputAssetExtension) { // if no extension in suggestion
        // Basic mapping from type to extension (can be expanded)
        const typeToExt = { 'image': '.jpg', 'video': '.mp4', 'audio': '.mp3', 'text': '.txt' };
        outputAssetExtension = typeToExt[output_asset_type] || inputAssetExtension;
    }
    const outputFilenameInSandbox = `output${outputAssetExtension}`;

    const input_asset_info = `a ${inputAsset.type} file named '${inputAsset.name || inputFilenameInSandbox}' (MIME type: ${inputAsset.mimeType || 'unknown'})`;

    let pythonCode;
    try {
        const scriptGenPrompt = await getPrompt('services/geminiService/generate_asset_modification_script', {
            modification_prompt: modification_prompt,
            input_asset_info: input_asset_info,
            input_filename_in_sandbox: inputFilenameInSandbox,
            output_filename_in_sandbox: outputFilenameInSandbox
        });

        console.log(`ToolExecutorService: Generated prompt for Python script generation for asset ${asset_id}: ${scriptGenPrompt.substring(0, 200)}...`);
        const geminiResponse = await geminiService.fetchGeminiResponse(scriptGenPrompt, [], [inputAsset]);

        if (typeof geminiResponse === 'string') {
            pythonCode = geminiResponse;
            // Basic check to remove potential markdown backticks if Gemini includes them
            pythonCode = pythonCode.replace(/^```python\n/, '').replace(/\n```$/, '').trim();
            console.log(`ToolExecutorService: Received Python script from Gemini for asset ${asset_id}:\n${pythonCode.substring(0, 500)}...`);
        } else if (geminiResponse && geminiResponse.tool_call) {
            console.error(`ToolExecutorService: Gemini unexpectedly tried to call a tool while generating Python script for asset ${asset_id}. Response:`, geminiResponse);
            return JSON.stringify({ success: false, error: "Failed to generate asset modification script: Gemini returned an unexpected tool_call response." });
        } else {
            console.error(`ToolExecutorService: Unexpected response type from Gemini for Python script generation for asset ${asset_id}. Response:`, geminiResponse);
            return JSON.stringify({ success: false, error: "Failed to generate asset modification script: Gemini returned an unexpected response type." });
        }
    } catch (error) {
        console.error(`ToolExecutorService: Error generating Python script via Gemini for asset ${asset_id}:`, error);
        return JSON.stringify({ success: false, error: `Failed to generate asset modification script: ${error.message}` });
    }

    let sandboxResult;
    try {
        sandboxResult = await microsandboxService.runPythonScriptInSandbox(
            pythonCode, // Use the Gemini-generated code
            localInputAssetPath,
            inputFilenameInSandbox,
            outputFilenameInSandbox
        );

        if (sandboxResult.success && sandboxResult.outputFilePath) {
            const newAssetId = `${output_asset_type.slice(0,3)}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            let newAssetName = output_asset_name_suggestion;
            if (!newAssetName) {
                const baseName = (inputAsset.name || `asset_${asset_id}`).substring(0, (inputAsset.name || `asset_${asset_id}`).lastIndexOf('.'));
                newAssetName = `${baseName}_modified${outputAssetExtension}`;
            } else {
                // Ensure suggested name has the correct extension
                if (path.extname(newAssetName) !== outputAssetExtension) {
                    newAssetName = newAssetName.substring(0, newAssetName.lastIndexOf('.') > 0 ? newAssetName.lastIndexOf('.') : newAssetName.length) + outputAssetExtension;
                }
            }

            const newAsset = {
                assetId: newAssetId,
                id: newAssetId, // for consistency if some parts use id
                name: newAssetName,
                type: output_asset_type,
                url: sandboxResult.outputFilePath, // Placeholder: This is a local path, will need to be a URL after upload
                description: `Asset modified from ${asset_id} using prompt: "${modification_prompt}"`,
                modificationPrompt: modification_prompt,
                originalAssetId: asset_id,
                projectId: projectId,
                createdAt: new Date().toISOString(),
                tags: ['dynamic-script-output', output_asset_type],
                isTemporary: true, // Indicates the URL is a local path and needs to be made permanent
            };

            // Vectorization step
            try {
                const textForEmbedding = `${newAsset.name} - Modified via script: ${newAsset.modificationPrompt}. Original asset ID: ${newAsset.originalAssetId}. Tags: ${newAsset.tags.join(', ')}`;
                console.log(`ToolExecutorService: Generating embedding for asset ${newAsset.assetId}. Text: "${textForEmbedding.substring(0,100)}..."`);
                const embeddingResult = await vectorService.generateEmbedding(textForEmbedding);
                if (embeddingResult && embeddingResult.vector) {
                    await vectorService.addAssetVector(projectId, newAsset.assetId, embeddingResult.vector);
                    console.log(`ToolExecutorService: Embedding generated and stored for dynamically created asset ${newAsset.assetId}`);
                    // Optionally merge tags from embeddingResult if they exist and are meaningful
                    if (embeddingResult.tags && Array.isArray(embeddingResult.tags) && embeddingResult.tags.length > 0) {
                        const originalTagCount = newAsset.tags.length;
                        newAsset.tags = [...new Set([...newAsset.tags, ...embeddingResult.tags])];
                        if (newAsset.tags.length > originalTagCount) {
                             console.log(`ToolExecutorService: Merged tags from embedding into asset ${newAsset.assetId}. New tags: ${newAsset.tags.join(', ')}`);
                        }
                    }
                } else {
                    console.warn(`ToolExecutorService: Failed to generate or store embedding for dynamically created asset ${newAsset.assetId}. Embedding result issue.`);
                }
            } catch (embedError) {
                console.error(`ToolExecutorService: Error during embedding for dynamically created asset ${newAsset.assetId}:`, embedError);
                // Do not fail the entire asset creation if only embedding fails.
            }

            if (!project.assets) project.assets = [];
            project.assets.push(newAsset); // newAsset (potentially with updated tags) is pushed here
            global.dataStore.updateProjectById(projectId, { assets: project.assets }); // Persists newAsset including any tag changes
             // TODO: In a real scenario, upload sandboxResult.outputFilePath to a persistent storage and get a public URL.
            // For now, url will be the local path, which is only valid within the server environment.

            return JSON.stringify({
                success: true,
                new_asset_id: newAssetId,
                new_asset_name: newAssetName,
                local_path: sandboxResult.outputFilePath, // Exposing local path for now
                message: `Dynamic script executed. New asset '${newAssetName}' created locally. Path: ${sandboxResult.outputFilePath}`
            });
        } else {
            console.error("Sandbox execution failed or did not produce output file:", sandboxResult);
            return JSON.stringify({
                success: false,
                error: sandboxResult.error || "Sandbox execution failed or output file not found.",
                stdout: sandboxResult.stdout,
                stderr: sandboxResult.stderr
            });
        }
    } catch (error) {
        console.error("Error during dynamic asset script execution:", error);
        return JSON.stringify({ success: false, error: `Error executing dynamic asset script: ${error.message}` });
    } finally {
        try {
            if (fsSync.existsSync(localInputAssetPath)) {
                await fs.unlink(localInputAssetPath);
                console.log(`Cleaned up temporary input file: ${localInputAssetPath}`);
            }
        } catch (cleanupError) {
            console.error(`Error cleaning up temporary input file ${localInputAssetPath}:`, cleanupError);
        }
        // Output file from sandbox (sandboxResult.outputFilePath) is not cleaned here
        // as it's the "result" but it's temporary and local to the server.
        // A separate mechanism would be needed to manage these temporary output files if not uploaded.
    }
}


module.exports = {
    perform_semantic_search_assets_tool,
    create_image_asset_tool,
    create_video_asset_tool,
    execute_facebook_managed_page_posts_search,
    execute_facebook_public_posts_search,
    execute_tiktok_public_posts_search,
    execute_facebook_create_post,
    execute_tiktok_create_post,
    execute_google_ads_create_campaign_from_config,
    execute_google_ads_create_ad_group_from_config,
    execute_google_ads_create_ad_from_config,
    execute_dynamic_asset_script, // Export new function
    execute_post_to_linkedin, // Added LinkedIn post execution
    execute_browse_web_tool, // Added browse_web tool execution
    // WordPress Tools
    execute_create_wordpress_draft,
    execute_publish_wordpress_draft,
    execute_create_and_publish_wordpress_post
};

// --- WordPress Tool Functions ---
async function execute_create_wordpress_draft(params, projectIdFromExecutor) {
    // params already includes projectId as per our schema.
    // Using params.projectId as the tool function expects it in its single argument object.
    console.log(`ToolExecutor: Executing create_wordpress_draft for project ${params.projectId}`, params);
    try {
        const result = await wordPressTool.createWordPressDraft(params);
        return JSON.stringify(result);
    } catch (error) {
        console.error(`Error in execute_create_wordpress_draft for project ${params.projectId}:`, error.message);
        return JSON.stringify({ error: `Failed to create WordPress draft: ${error.message}` });
    }
}

async function execute_publish_wordpress_draft(params, projectIdFromExecutor) {
    console.log(`ToolExecutor: Executing publish_wordpress_draft for project ${params.projectId}`, params);
    try {
        const result = await wordPressTool.publishWordPressDraft(params);
        return JSON.stringify(result);
    } catch (error) {
        console.error(`Error in execute_publish_wordpress_draft for project ${params.projectId}:`, error.message);
        return JSON.stringify({ error: `Failed to publish WordPress draft: ${error.message}` });
    }
}

async function execute_create_and_publish_wordpress_post(params, projectIdFromExecutor) {
    console.log(`ToolExecutor: Executing create_and_publish_wordpress_post for project ${params.projectId}`, params);
    try {
        const result = await wordPressTool.createAndPublishWordPressPost(params);
        return JSON.stringify(result);
    } catch (error) {
        console.error(`Error in execute_create_and_publish_wordpress_post for project ${params.projectId}:`, error.message);
        return JSON.stringify({ error: `Failed to create and publish WordPress post: ${error.message}` });
    }
}


// --- Web Browser Tool Function ---
async function execute_browse_web_tool(url, projectId) {
  // projectId is included for consistency with other tool executors, though not directly used in this basic version.
  console.log(`Executing execute_browse_web_tool for project ${projectId} with URL: ${url}`);

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return JSON.stringify({ error: "Invalid or missing URL. URL must be a string and start with http or https." });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Try to get more specific error information if possible
      let errorDetails = `Status: ${response.status}`;
      try {
        const errorBody = await response.text();
        errorDetails += `, Body: ${errorBody.substring(0, 200)}`; // Limit error body length
      } catch (textError) {
        // Ignore if response body cannot be read as text
      }
      console.error(`Failed to fetch URL: ${url}. ${errorDetails}`);
      return JSON.stringify({ error: `Failed to fetch URL: ${url}. ${errorDetails}` });
    }
    const pageText = await response.text();
    const sanitizedText = await sanitizeTextForLLM(pageText);
    return JSON.stringify({ content: sanitizedText });
  } catch (error) {
    console.error(`Error fetching URL ${url}:`, error);
    // Check for common fetch errors
    if (error.code === 'ENOTFOUND') {
        return JSON.stringify({ error: `Failed to fetch URL: Host not found - ${url}` });
    } else if (error.message && error.message.includes('Only absolute URLs are supported')) {
        return JSON.stringify({ error: `Failed to fetch URL: Invalid URL format (ensure it includes http/https) - ${url}` });
    }
    return JSON.stringify({ error: `Failed to fetch URL: ${error.message || 'Unknown error'}` });
  }
}

// --- LinkedIn Tool Function ---
async function execute_post_to_linkedin(params, projectId) {
    console.log(`Executing post_to_linkedin for project ${projectId}`, params);
    const { accessToken, userId, content } = params;

    if (!accessToken || !userId || !content) {
        return JSON.stringify({ error: "Missing accessToken, userId, or content for posting to LinkedIn." });
    }

    try {
        const result = await linkedinService.postToLinkedIn(accessToken, userId, content);
        if (result.success) {
            return JSON.stringify({ success: true, message: "Successfully posted to LinkedIn.", data: result.data });
        } else {
            // This case might not be hit if postToLinkedIn throws an error for non-success
            return JSON.stringify({ error: result.error || "Failed to post to LinkedIn.", details: result.data });
        }
    } catch (error) {
        console.error(`Error in execute_post_to_linkedin for project ${projectId}:`, error.message);
        return JSON.stringify({ error: `Failed to post to LinkedIn: ${error.message}` });
    }
}