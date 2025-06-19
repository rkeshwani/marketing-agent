// src/services/wordpressService.js
const WPAPI = require('wpapi');
// Correct the import path for dataStore based on its actual location relative to wordpressService.js
// Assuming dataStore.js is in the same directory as Project.js, and wordpressService.js is in services/
// The original subtask had it as '../dataStore' which implies dataStore is one level up from services.
// Let's assume it's: const { saveWordpressCredentials, getWordpressCredentials } = require('../dataStore');
const { saveWordpressCredentials, getWordpressCredentials } = require('../dataStore');

let wpInstance; // This instance will be tied to the projectId passed to initWpapi

/**
 * Initializes the WPAPI instance with stored credentials for a specific project.
 * @param {string} projectId - The ID of the project.
 */
async function initWpapi(projectId) {
  if (!projectId) {
    console.warn('Project ID is required to initialize WPAPI.');
    wpInstance = null;
    return null;
  }
  const creds = await getWordpressCredentials(projectId);
  if (creds && creds.url && creds.username && creds.applicationPassword) {
    wpInstance = new WPAPI({
      endpoint: creds.url + (creds.url.endsWith('/') ? '' : '/') + 'wp-json',
      username: creds.username,
      password: creds.applicationPassword,
      auth: true,
    });
    console.log(`WordPress API client initialized for project ID: ${projectId}.`);
  } else {
    console.warn(`WordPress credentials not found or incomplete for project ID: ${projectId}. WPAPI not initialized.`);
    wpInstance = null;
  }
  return wpInstance;
}

/**
 * Creates a new WPAPI instance with provided credentials.
 * This function is standalone and does not use the global wpInstance.
 * @param {string} url - The WordPress site URL.
 * @param {string} username - The WordPress username.
 * @param {string} applicationPassword - The WordPress application password.
 * @returns {WPAPI} - A WPAPI instance.
 */
function getWpapiInstance(url, username, applicationPassword) {
  if (!url || !username || !applicationPassword) {
    throw new Error('WordPress URL, username, and application password are required.');
  }
  return new WPAPI({
    endpoint: url + (url.endsWith('/') ? '' : '/') + 'wp-json',
    username: username,
    password: applicationPassword,
    auth: true,
  });
}

/**
 * Stores WordPress credentials for a specific project.
 * @param {string} projectId - The ID of the project.
 * @param {string} url - The WordPress site URL.
 * @param {string} username - The WordPress username.
 * @param {string} applicationPassword - The WordPress application password.
 */
async function storeCredentials(projectId, url, username, applicationPassword) {
  if (!projectId || !url || !username || !applicationPassword) {
    throw new Error('Project ID, URL, username, and application password are required to store credentials.');
  }
  await saveWordpressCredentials(projectId, { url, username, applicationPassword });
  console.log(`WordPress credentials stored for project ID: ${projectId}.`);
  // Re-initialize the shared wpInstance with new credentials for this project
  return initWpapi(projectId);
}

/**
 * Creates a new post in WordPress.
 * Relies on wpInstance being initialized for a project via initWpapi(projectId),
 * or an apiInstance being passed explicitly.
 * @param {object} postData - The post data.
 * @param {string} postData.title - The title of the post.
 * @param {string} postData.content - The content of the post.
 * @param {string} [postData.status='draft'] - The status of the post (e.g., 'draft', 'publish').
 * @param {WPAPI} [apiInstance] - Optional WPAPI instance to use. If not provided, uses the shared project-specific instance.
 * @returns {Promise<object>} - A promise that resolves with the API response data.
 */
async function createPost({ title, content, status = 'draft' }, apiInstance) {
  const instance = apiInstance || wpInstance;
  if (!instance) {
    throw new Error('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
  }
  if (!title || !content) {
    throw new Error('Post title and content are required.');
  }

  try {
    const post = await instance.posts().create({
      title,
      content,
      status,
    });
    console.log(`Post "${title}" created with ID: ${post.id} and status: ${status}`);
    return post;
  } catch (error) {
    console.error('Error creating WordPress post:', error.message);
    if (error.data && error.data.message) {
        console.error('WordPress API Error:', error.data.message);
        throw new Error(`WordPress API Error: ${error.data.message}`);
    }
    throw error;
  }
}

/**
 * Updates an existing post's status in WordPress.
 * Relies on wpInstance being initialized for a project via initWpapi(projectId),
 * or an apiInstance being passed explicitly.
 * @param {number|string} postId - The ID of the post to update.
 * @param {string} status - The new status for the post (e.g., 'publish', 'draft').
 * @param {WPAPI} [apiInstance] - Optional WPAPI instance to use. If not provided, uses the shared project-specific instance.
 * @returns {Promise<object>} - A promise that resolves with the API response data.
 */
async function updatePostStatus(postId, status, apiInstance) {
  const instance = apiInstance || wpInstance;
  if (!instance) {
    throw new Error('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
  }
  if (!postId || !status) {
    throw new Error('Post ID and new status are required.');
  }

  try {
    const updatedPost = await instance.posts().id(postId).update({
      status,
    });
    console.log(`Post ID ${postId} status updated to: ${status}`);
    return updatedPost;
  } catch (error) {
    console.error(`Error updating post status for ID ${postId}:`, error.message);
     if (error.data && error.data.message) {
        console.error('WordPress API Error:', error.data.message);
        throw new Error(`WordPress API Error: ${error.data.message}`);
    }
    throw error;
  }
}

/**
 * Fetches posts from WordPress.
 * Relies on wpInstance being initialized for a project via initWpapi(projectId),
 * or an apiInstance being passed explicitly.
 * @param {object} [params={ per_page: 10, status: 'draft' }] - Parameters for fetching posts.
 * @param {WPAPI} [apiInstance] - Optional WPAPI instance to use. If not provided, uses the shared project-specific instance.
 * @returns {Promise<Array<object>>} - A promise that resolves with an array of post objects.
 */
async function fetchPosts(params = { per_page: 10, status: 'draft' }, apiInstance) {
  const instance = apiInstance || wpInstance;
  if (!instance) {
    throw new Error('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
  }

  try {
    const queryParams = { status: 'draft', ...params };
    const posts = await instance.posts().param(queryParams);
    console.log(`Fetched ${posts.length} posts with params:`, queryParams);
    return posts;
  } catch (error) {
    console.error('Error fetching WordPress posts:', error.message);
    if (error.data && error.data.message) {
        console.error('WordPress API Error:', error.data.message);
        throw new Error(`WordPress API Error: ${error.data.message}`);
    }
    throw error;
  }
}

module.exports = {
  initWpapi,
  getWpapiInstance, // This one remains project-agnostic if called directly
  storeCredentials,
  createPost,
  updatePostStatus,
  fetchPosts,
};
