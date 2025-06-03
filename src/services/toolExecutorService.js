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

module.exports = {
    perform_semantic_search_assets_tool,
    create_image_asset_tool,
    create_video_asset_tool
};
