// src/tools/wordpressTool.js
const WPAPI = require('wordpress-rest-api');
const dataStore = require('../dataStore'); // To get project-specific WordPress credentials

// Helper function to initialize WPAPI client
function getWordPressClient(projectId) {
    const project = dataStore.findProjectById(projectId);
    if (!project) {
        console.error(`[wordpressTool.getWordPressClient] Project not found: ${projectId}`);
        throw new Error(`Project not found: ${projectId}`);
    }

    const { wordpressUrl, wordpressUsername, wordpressApplicationPassword } = project;

    if (!wordpressUrl || !wordpressUsername || !wordpressApplicationPassword) {
        console.error(`[wordpressTool.getWordPressClient] WordPress integration is not configured for project ${projectId}.`);
        throw new Error('WordPress integration is not configured for this project. Please set the WordPress URL, Username, and Application Password in project settings.');
    }

    let effectiveEndpoint = wordpressUrl;
    // The `wordpress-rest-api` library expects the endpoint to be the full REST API base,
    // e.g., "https://example.com/wp-json"
    if (!wordpressUrl.includes('/wp-json')) {
        effectiveEndpoint = wordpressUrl.replace(/\/$/, '') + '/wp-json';
        console.log(`[wordpressTool.getWordPressClient] Appended /wp-json to WordPress URL. Using endpoint: ${effectiveEndpoint}`);
    } else {
        console.log(`[wordpressTool.getWordPressClient] Using provided WordPress URL as endpoint: ${effectiveEndpoint}`);
    }

    return new WPAPI({
        endpoint: effectiveEndpoint,
        username: wordpressUsername,
        password: wordpressApplicationPassword, // Application Password
        auth: true // Use basic auth with username and application password
    });
}

/**
 * Creates a new post on WordPress.
 *
 * @param {string} projectId The ID of the project.
 * @param {string} title The title of the post.
 * @param {string} content The content of the post.
 * @param {string} status The status of the post (e.g., 'draft', 'publish').
 * @returns {Promise<object>} The response from the WordPress API (the created post object).
 * @throws {Error} If WordPress is not configured for the project or if the API call fails.
 */
async function createWordPressPost({ projectId, title, content, status = 'draft' }) {
    console.log(`[wordpressTool.createWordPressPost] Attempting to create post for project ${projectId}. Title: ${title}, Status: ${status}`);
    const wp = getWordPressClient(projectId);

    try {
        const post = await wp.posts().create({
            title,
            content,
            status,
        });
        console.log(`[wordpressTool.createWordPressPost] Post created successfully on WordPress. Post ID: ${post.id}, Status: ${post.status}`);
        return post;
    } catch (error) {
        console.error('[wordpressTool.createWordPressPost] Error creating WordPress post:', error.message);
        if (error.response && error.response.data && error.response.data.message) {
            throw new Error(`WordPress API Error: ${error.response.data.message}`);
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error(`WordPress API Error: Could not connect to the WordPress site. Please check the URL.`);
        }
        throw new Error(`Failed to create WordPress post: ${error.message}`);
    }
}

/**
 * Updates an existing post on WordPress.
 *
 * @param {string} projectId The ID of the project.
 * @param {number|string} postId The ID of the post to update in WordPress.
 * @param {object} updates An object containing the fields to update (e.g., { title, content, status }).
 * @returns {Promise<object>} The response from the WordPress API (the updated post object).
 * @throws {Error} If WordPress is not configured for the project or if the API call fails.
 */
async function updateWordPressPost({ projectId, postId, updates }) {
    console.log(`[wordpressTool.updateWordPressPost] Attempting to update post ${postId} for project ${projectId}. Updates: ${JSON.stringify(updates)}`);
    if (!postId) {
        throw new Error('WordPress Post ID is required to update a post.');
    }
    if (!updates || Object.keys(updates).length === 0) {
        throw new Error('No updates provided for the WordPress post.');
    }

    const wp = getWordPressClient(projectId);

    try {
        const updatedPost = await wp.posts().id(postId).update(updates);
        console.log(`[wordpressTool.updateWordPressPost] Post ${postId} updated successfully on WordPress. New status: ${updatedPost.status}`);
        return updatedPost;
    } catch (error) {
        console.error(`[wordpressTool.updateWordPressPost] Error updating WordPress post ${postId}:`, error.message);
        if (error.response && error.response.data && error.response.data.message) {
            // Specific check for "Invalid post ID." or similar errors if the post doesn't exist
            if (error.response.data.code === 'rest_post_invalid_id') {
                 throw new Error(`WordPress API Error: Invalid Post ID ${postId}. The post may not exist.`);
            }
            throw new Error(`WordPress API Error: ${error.response.data.message}`);
        }
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error(`WordPress API Error: Could not connect to the WordPress site. Please check the URL.`);
        }
        throw new Error(`Failed to update WordPress post ${postId}: ${error.message}`);
    }
}

// Specific tool functions that the agent might use:

/**
 * Creates a draft post in WordPress.
 * Tool Name: createWordPressDraft
 * Description: Creates a new draft post in the WordPress site linked to the project.
 * Arguments:
 *  - projectId: string (The ID of the current project)
 *  - title: string (The title for the draft post)
 *  - content: string (The HTML content for the draft post)
 * Returns: object (The created draft post object from WordPress, including its ID)
 */
async function createWordPressDraft({ projectId, title, content }) {
    return createWordPressPost({ projectId, title, content, status: 'draft' });
}

/**
 * Publishes an existing draft post in WordPress.
 * Tool Name: publishWordPressDraft
 * Description: Publishes an existing draft post in the WordPress site linked to the project. The content can optionally be updated.
 * Arguments:
 *  - projectId: string (The ID of the current project)
 *  - postId: number (The ID of the WordPress post to publish)
 *  - title: string (Optional: New title for the post. If not provided, existing title is used.)
 *  - content: string (Optional: New HTML content for the post. If not provided, existing content is used.)
 * Returns: object (The published post object from WordPress)
 */
async function publishWordPressDraft({ projectId, postId, title, content }) {
    const updates = { status: 'publish' };
    if (title) updates.title = title;
    if (content) updates.content = content;
    return updateWordPressPost({ projectId, postId, updates });
}

/**
 * Creates and immediately publishes a new post in WordPress.
 * Tool Name: createAndPublishWordPressPost
 * Description: Creates a new post and immediately publishes it on the WordPress site linked to the project.
 * Arguments:
 *  - projectId: string (The ID of the current project)
 *  - title: string (The title for the post)
 *  - content: string (The HTML content for the post)
 * Returns: object (The published post object from WordPress)
 */
async function createAndPublishWordPressPost({ projectId, title, content }) {
    return createWordPressPost({ projectId, title, content, status: 'publish' });
}


module.exports = {
    createWordPressDraft,
    publishWordPressDraft,
    createAndPublishWordPressPost,
    // Expose lower-level functions if direct use is needed, though agent tools are preferred
    // createWordPressPost,
    // updateWordPressPost,
};
