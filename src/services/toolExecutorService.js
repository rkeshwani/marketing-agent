// src/services/toolExecutorService.js

const fetch = require('node-fetch');
const config = require('../config/config'); // Path relative to src/services/
const vectorService = require('./vectorService'); // In the same services folder

// Note: The following functions rely on global.dataStore being available,
// similar to how they were used when defined directly in agent.js.
// This dependency should be managed more explicitly in a production system (e.g., via DI).

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

        if (!similarAssetIds || similarAssetIds.length === 0) {
            return JSON.stringify([]);
        }

        const project = global.dataStore.findProjectById(projectId);
        if (!project || !project.assets || project.assets.length === 0) {
            console.warn(`No assets found for project ${projectId} to match against search results.`);
            return JSON.stringify([]);
        }

        const results = project.assets
            .filter(asset => similarAssetIds.includes(asset.assetId || asset.id))
            .map(r => ({
                id: r.assetId || r.id,
                name: r.name,
                type: r.type,
                description: r.description,
                url: r.url
            }));

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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
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
            assetId: assetId,
            name: assetName,
            type: 'image',
            url: imageUrl,
            prompt: prompt,
            description: assetDescription,
            tags: ['ai-generated', 'image'],
            createdAt: new Date().toISOString()
        };

        const project = global.dataStore.findProjectById(projectId);
        if (!project) {
            return JSON.stringify({ error: 'Project not found, cannot save image asset.' });
        }
        if (!project.assets) { project.assets = []; }
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
            asset_id: newAsset.assetId,
            image_url: newAsset.url,
            name: newAsset.name,
            message: 'Image asset created, saved, and indexed for search.'
        });

    } catch (error) {
        console.error("Error in create_image_asset_tool:", error);
        if (error.message.includes('fetch is not defined') || error.message.includes('Only absolute URLs are supported')) {
             console.error("Fetch error detail:", error);
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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
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
            assetId: assetId,
            name: assetName,
            type: 'video',
            url: videoUrl,
            prompt: prompt,
            description: assetDescription,
            tags: ['ai-generated', 'video'],
            createdAt: new Date().toISOString()
        };

        const project = global.dataStore.findProjectById(projectId);
        if (!project) {
            return JSON.stringify({ error: 'Project not found, cannot save video asset.' });
        }
        if (!project.assets) { project.assets = []; }
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
            asset_id: newAsset.assetId,
            video_url: newAsset.url,
            name: newAsset.name,
            message: 'Video asset created, saved, and indexed for search.'
        });

    } catch (error) {
        console.error("Error in create_video_asset_tool:", error);
        if (error.message.includes('fetch is not defined') || error.message.includes('Only absolute URLs are supported')) {
             console.error("Fetch error detail:", error);
             return JSON.stringify({ error: "Network error or misconfiguration calling video generation service."});
        }
        return JSON.stringify({ error: "An unexpected error occurred while creating the video asset." });
    }
}

// --- New Social Media Tool Functions ---

async function execute_facebook_managed_page_posts_search(params, projectId) {
    console.log(`Executing facebook_managed_page_posts_search for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);
    if (!project) return JSON.stringify({ error: "Project not found." });
    if (!project.facebookPageAccessToken || !project.facebookSelectedPageID) {
        return JSON.stringify({ error: "Facebook Page access token or Page ID not configured for this project." });
    }
    // Mock API call
    const keywords = params && params.keywords ? params.keywords : '';
    const apiUrl = `https://graph.facebook.com/v18.0/${project.facebookSelectedPageID}/posts?access_token=${project.facebookPageAccessToken}&q=${encodeURIComponent(keywords)}`;
    console.log("Mocking API call to Facebook (managed page posts search):", apiUrl);
    // In a real scenario, use fetch. For now, return mock data.
    return JSON.stringify({
        data: [{ id: `${project.facebookSelectedPageID}_mockpost1`, message: `Mock post about ${keywords || 'anything'} from managed page`, created_time: new Date().toISOString() }],
        paging: { cursors: { after: "mock_after_cursor" }}
    });
}

async function execute_facebook_public_posts_search(params, projectId) {
    console.log(`Executing facebook_public_posts_search for project ${projectId}`, params);
    const project = global.dataStore.findProjectById(projectId);

    // Public searches might use a long-lived App Access Token or a User Access Token.
    // For this mock, we prioritize project's user token, then check for an app token in config.
    // Note: A FACEBOOK_APP_ACCESS_TOKEN would need to be added to config.js if this strategy is used.
    const appAccessToken = config.FACEBOOK_APP_ACCESS_TOKEN;
    const tokenToUse = (project && project.facebookUserAccessToken) ? project.facebookUserAccessToken : appAccessToken;

    if(!tokenToUse) {
        return JSON.stringify({ error: "Facebook access token (user or app) not available for public search." });
    }

    const keywords = params && params.keywords ? params.keywords : '';
    const target = params && params.targetPublicPageIdOrName ? params.targetPublicPageIdOrName : 'cocacola'; // Default for mock
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
    // Assuming a TikTok access token might be useful for rate limits or specific search types,
    // but public search might also work without one for some queries.
    if (!project || !project.tiktokAccessToken) {
        console.warn("TikTok access token not configured for this project. Proceeding with public search if possible.");
        // Depending on actual API, might return error or proceed without token.
    }
    const keywordsOrHashtags = params && params.keywordsOrHashtags ? params.keywordsOrHashtags : '';
    const apiUrl = `https://api.tiktok.com/v2/research/video/query/?query=${encodeURIComponent(keywordsOrHashtags)}`; // Example endpoint
    console.log("Mocking API call to TikTok (public posts search):", apiUrl);
    return JSON.stringify({
        data: { videos: [{ video_id: 'mocktiktok1', video_description: `TikTok about ${keywordsOrHashtags}`, author_unique_id: 'tiktok_user_mock' }]}, // Corrected field name
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
    const apiUrl = `https://api.tiktok.com/v2/post/publish/video/`; // Example endpoint
    console.log("Mocking API POST to TikTok (create post):", apiUrl, "with data:", postData);

    return JSON.stringify({ data: { item_id: `mocktiktokpost${Date.now()}` }, error_code: 0, error_message: "" });
}

module.exports = {
    perform_semantic_search_assets_tool,
    create_image_asset_tool,
    create_video_asset_tool,
    execute_facebook_managed_page_posts_search,
    execute_facebook_public_posts_search,
    execute_tiktok_public_posts_search,
    execute_facebook_create_post,
    execute_tiktok_create_post
};
