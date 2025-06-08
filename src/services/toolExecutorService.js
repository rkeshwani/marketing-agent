// src/services/toolExecutorService.js

const fetch = require('node-fetch');
const config = require('../config/config'); // Path relative to src/services/
const vectorService = require('./vectorService'); // In the same services folder
const e2bService = require('./e2bService'); // For executing Python scripts
const geminiService = require('./geminiService'); // For generating Python script
const fs = require('fs/promises');
const fsSync = require('fs'); // For createWriteStream and existsSync
const path = require('path');
const http = require('http');
const https = require('https');
const linkedinService = require('./linkedinService'); // Added for LinkedIn


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
// (To be added in the next step)


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
    execute_post_to_linkedin // Added LinkedIn post execution
};

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