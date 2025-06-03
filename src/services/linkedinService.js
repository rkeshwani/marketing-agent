// src/services/linkedinService.js
const axios = require('axios');

/**
 * Posts content to LinkedIn on behalf of the user.
 * @param {string} accessToken - The user's LinkedIn access token.
 * @param {string} userId - The user's LinkedIn ID (URN format, e.g., urn:li:person:USER_ID).
 * @param {string} postContentText - The text content for the LinkedIn post.
 * @returns {Promise<object>} - A promise that resolves with the API response data or rejects with an error.
 */
async function postToLinkedIn(accessToken, userId, postContentText) {
    const ugcPostsUrl = 'https://api.linkedin.com/v2/ugcPosts';

    const requestBody = {
        author: userId, // URN format e.g., "urn:li:person:USER_ID"
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: postContentText,
                },
                shareMediaCategory: 'NONE', // For text-only posts
            },
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC', // Or 'CONNECTIONS'
        },
    };

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0', // Required for some LinkedIn APIs
    };

    try {
        const response = await axios.post(ugcPostsUrl, requestBody, { headers });
        // LinkedIn usually returns 201 Created for successful posts
        if (response.status === 201) {
            console.log('Successfully posted to LinkedIn:', response.data);
            return { success: true, data: response.data };
        } else {
            // This case might not be hit if axios throws for non-2xx statuses by default
            console.warn(`LinkedIn post attempt returned status ${response.status}:`, response.data);
            return { success: false, error: `Unexpected status code: ${response.status}`, data: response.data };
        }
    } catch (error) {
        console.error('Error posting to LinkedIn:');
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
            console.error('Data:', error.response.data);
            // Rethrow a more specific error or return a structured error object
            throw new Error(`LinkedIn API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Request Error:', error.request);
            throw new Error('Error posting to LinkedIn: No response received from server.');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error Message:', error.message);
            throw new Error(`Error posting to LinkedIn: ${error.message}`);
        }
    }
}

module.exports = {
    postToLinkedIn,
};
