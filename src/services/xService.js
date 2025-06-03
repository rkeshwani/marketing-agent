// src/services/xService.js
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const config = require('../config/config');

const X_API_BASE_URL = 'https://api.x.com/2';
const X_OAUTH2_TOKEN_URL = 'https://api.x.com/oauth2/token';
const X_OAUTH2_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
// Using the V2_MEDIA_UPLOAD_URL as specified in the prompt for all media commands
const X_V2_MEDIA_UPLOAD_URL = 'https://api.x.com/2/media/upload';

let appOnlyBearerToken = null;

const pendingAuthorizations = {};
const userTokens = {};


function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

async function getAppOnlyBearerToken() {
    if (appOnlyBearerToken) {
        return appOnlyBearerToken;
    }

    if (process.env.X_BEARER_TOKEN) {
        appOnlyBearerToken = process.env.X_BEARER_TOKEN;
        return appOnlyBearerToken;
    }

    const apiKeyFromConfig = config.x && config.x.apiKey;
    const apiSecretKeyFromConfig = config.x && config.x.apiSecretKey;

    const apiKey = process.env.X_API_KEY || apiKeyFromConfig;
    const apiSecretKey = process.env.X_API_SECRET_KEY || apiSecretKeyFromConfig;

    if (!apiKey || !apiSecretKey) {
        console.error('X.com API Key or Secret Key is not configured.');
        throw new Error('X.com API Key or Secret Key is not configured.');
    }

    const credentials = Buffer.from(`${apiKey}:${apiSecretKey}`).toString('base64');

    try {
        const response = await axios.post(
            X_OAUTH2_TOKEN_URL,
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                },
            }
        );

        if (response.data && response.data.token_type === 'bearer' && response.data.access_token) {
            appOnlyBearerToken = response.data.access_token;
            console.log('Successfully fetched X.com App-Only Bearer Token.');
            return appOnlyBearerToken;
        } else {
            throw new Error('Invalid response format when fetching X.com App-Only Bearer Token.');
        }
    } catch (error) {
        console.error('Error fetching X.com App-Only Bearer Token:');
        if (error.response) {
            const errorData = error.response.data;
            console.error('Status:', error.response.status);
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Data:', JSON.stringify(errorData, null, 2));
            if (errorData && (errorData.error_description || errorData.error)) {
                 throw new Error(`Failed to fetch X.com App-Only Bearer Token: ${errorData.error_description || errorData.error} (Status: ${error.response.status})`);
            }
        }
        throw new Error(`Failed to fetch X.com App-Only Bearer Token: ${error.message}`);
    }
}

async function _requestXApi({ method, endpoint, data, params, userAccessToken, headers: customHeaders }) {
    const url = `${X_API_BASE_URL}/${endpoint}`;
    let authToken;

    if (userAccessToken) {
        authToken = userAccessToken;
    } else {
        try {
            authToken = await getAppOnlyBearerToken();
        } catch (error) {
            throw error;
        }
    }

    const defaultHeaders = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };

    const headers = { ...defaultHeaders, ...customHeaders };

    if (data instanceof FormData) {
        delete headers['Content-Type'];
    }


    try {
        const response = await axios({
            method: method.toUpperCase(),
            url,
            data: data || undefined,
            params: params || undefined,
            headers,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        if (response.headers['x-rate-limit-limit']) {
            console.log(`X API Rate Limit: ${response.headers['x-rate-limit-remaining']}/${response.headers['x-rate-limit-limit']}, Resets: ${new Date(parseInt(response.headers['x-rate-limit-reset']) * 1000)}`);
        }

        return response.data;
    } catch (error) {
        console.error(`Error calling X API endpoint ${method.toUpperCase()} ${url}:`);
        if (error.response) {
            const errorData = error.response.data;
            console.error('Status:', error.response.status);
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Data:', JSON.stringify(errorData, null, 2));
            if (error.response.headers && error.response.headers['x-rate-limit-limit']) {
                console.error(`X API Rate Limit (on error): ${error.response.headers['x-rate-limit-remaining']}/${error.response.headers['x-rate-limit-limit']}, Resets: ${new Date(parseInt(error.response.headers['x-rate-limit-reset']) * 1000)}`);
            }
            let errorMessage = `X API Error: ${error.response.status}`;
            if (errorData && errorData.title) errorMessage += ` - ${errorData.title}`;
            if (errorData && errorData.detail) errorMessage += `: ${errorData.detail}`;
            if (errorData && errorData.errors) errorMessage += ` - ${JSON.stringify(errorData.errors)}`;
            if (errorData && errorData.error && typeof errorData.error === 'string') { // Check if error is a simple string
                 errorMessage = `X API Error ${error.response.status}: ${errorData.error} - ${errorData.error_description || ''}`;
            } else if (errorData && errorData.problem) { // For ProblemDetail RFC 7807
                 errorMessage = `X API Error ${error.response.status}: ${errorData.problem.type} - ${errorData.problem.title}`;
            }


            throw new Error(errorMessage.trim());
        }
        throw new Error(`Error setting up X API request: ${error.message}`);
    }
}

async function initiateXAuthorization(sessionId) {
    const clientIdFromConfig = config.x && config.x.clientId;
    const redirectUriFromConfig = config.x && config.x.redirectUri;

    const clientId = process.env.X_CLIENT_ID || clientIdFromConfig;
    const redirectUri = process.env.X_REDIRECT_URI || redirectUriFromConfig;
    const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'].join(' ');

    if (!clientId || !redirectUri) {
        console.error('X.com Client ID or Redirect URI is not configured.');
        throw new Error('X.com Client ID or Redirect URI is not configured.');
    }

    const state = crypto.randomBytes(16).toString('hex');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    pendingAuthorizations[sessionId] = { state, codeVerifier, clientId, redirectUri };

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopes,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    const authorizationUrl = `${X_OAUTH2_AUTHORIZE_URL}?${params.toString()}`;
    return { authorizationUrl, state };
}

async function handleXAuthorizationCallback(sessionId, code, receivedState) {
    const storedAuth = pendingAuthorizations[sessionId];

    if (!storedAuth) throw new Error('Invalid session or authorization request expired.');
    if (storedAuth.state !== receivedState) {
        delete pendingAuthorizations[sessionId];
        throw new Error('CSRF detected: State mismatch.');
    }

    const { codeVerifier, clientId, redirectUri } = storedAuth;
    if (!clientId || !redirectUri) {
        delete pendingAuthorizations[sessionId];
        throw new Error('Internal configuration error during OAuth callback.');
    }

    const tokenRequestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
    });

    try {
        const response = await axios.post( X_OAUTH2_TOKEN_URL, tokenRequestBody.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, refresh_token, expires_in, scope, token_type } = response.data;
        if (token_type !== 'bearer' || !access_token) throw new Error('Invalid token response from X.com');

        userTokens[sessionId] = { accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in, scope: scope, linkedAt: new Date().toISOString() };
        delete pendingAuthorizations[sessionId];

        return { success: true, message: 'X.com account linked successfully.', tokens: { accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in, scope }};
    } catch (error) {
        delete pendingAuthorizations[sessionId];
        console.error(`Error exchanging authorization code for X.com tokens for session ${sessionId}:`);
        if (error.response) {
            const errorData = error.response.data;
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(errorData, null, 2));
            const errorDescription = errorData.error_description || errorData.error || JSON.stringify(errorData);
            throw new Error(`X API Token Error: ${error.response.status} - ${errorDescription}`);
        }
        throw new Error(`Error setting up X API token request: ${error.message}`);
    }
}

async function searchTweetsByUsername(username, userAccessToken = null) {
    if (!username || typeof username !== 'string' || username.trim() === '') {
        throw new Error('Username is required and must be a non-empty string to search tweets.');
    }
    const cleanedUsername = username.startsWith('@') ? username.substring(1) : username;
    const query = `from:${cleanedUsername}`;
    const params = { 'query': query, 'tweet.fields': 'created_at,text,public_metrics,author_id,id', 'max_results': 10 };
    try {
        return await _requestXApi({ method: 'GET', endpoint: 'tweets/search/recent', params: params, userAccessToken: userAccessToken });
    } catch (error) {
        console.error(`Error in searchTweetsByUsername for ${cleanedUsername}: ${error.message}`);
        throw error;
    }
}

async function searchRecentTweets(searchQuery, userAccessToken = null) {
    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim() === '') {
        throw new Error('Search query is required and must be a non-empty string.');
    }
    const params = { 'query': searchQuery, 'tweet.fields': 'created_at,text,public_metrics,author_id,id', 'max_results': 10 };
    try {
        return await _requestXApi({ method: 'GET', endpoint: 'tweets/search/recent', params: params, userAccessToken: userAccessToken });
    } catch (error) {
        console.error(`Error in searchRecentTweets with query "${searchQuery}": ${error.message}`);
        throw error;
    }
}

async function postTextTweet(text, userAccessToken) {
    if (!userAccessToken) throw new Error('User access token is required to post a tweet.');
    if (!text || typeof text !== 'string' || text.trim() === '') throw new Error('Tweet text cannot be empty and must be a string.');
    if (text.length > 280) console.warn('Tweet text exceeds 280 characters, potential for API error.');

    const requestData = { text: text };
    try {
        return await _requestXApi({ method: 'POST', endpoint: 'tweets', data: requestData, userAccessToken: userAccessToken });
    } catch (error) {
        console.error(`Error in postTextTweet: ${error.message}`);
        throw error;
    }
}

// --- New Media Upload and Image Tweet Functions ---

async function _uploadMedia(imageData, imageMimeType, appOnlyAccessToken) {
    // Step 1: INIT
    let mediaIdString;
    try {
        const initParams = new URLSearchParams();
        initParams.append('command', 'INIT');
        initParams.append('total_bytes', imageData.length.toString());
        initParams.append('media_type', imageMimeType);
        initParams.append('media_category', 'tweet_image');

        const initResponse = await axios.post(X_V2_MEDIA_UPLOAD_URL, initParams.toString(), {
            headers: {
                'Authorization': `Bearer ${appOnlyAccessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        });
        mediaIdString = initResponse.data.media_id_string; // Corrected to media_id_string
        if (!mediaIdString) throw new Error('Media ID string not found in INIT response.');
        // console.log(`Media INIT successful. Media ID: ${mediaIdString}`);
    } catch (error) {
        console.error('Error in Media INIT:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error(`Media INIT failed: ${error.message}`);
    }

    // Step 2: APPEND
    try {
        const appendForm = new FormData();
        appendForm.append('command', 'APPEND');
        appendForm.append('media_id', mediaIdString);
        appendForm.append('segment_index', '0');
        appendForm.append('media', imageData, { filename: 'media', contentType: imageMimeType });

        const appendHeaders = { ...appendForm.getHeaders(), 'Authorization': `Bearer ${appOnlyAccessToken}`};

        await axios.post(X_V2_MEDIA_UPLOAD_URL, appendForm, {
            headers: appendHeaders,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
        // console.log(`Media APPEND successful for Media ID: ${mediaIdString}`);
    } catch (error) {
        console.error('Error in Media APPEND:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error(`Media APPEND failed: ${error.message}`);
    }

    // Step 3: FINALIZE
    try {
        const finalizeParams = new URLSearchParams();
        finalizeParams.append('command', 'FINALIZE');
        finalizeParams.append('media_id', mediaIdString);

        const finalizeResponse = await axios.post(X_V2_MEDIA_UPLOAD_URL, finalizeParams.toString(), {
            headers: {
                'Authorization': `Bearer ${appOnlyAccessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            }
        });

        if (finalizeResponse.data.processing_info) {
            const state = finalizeResponse.data.processing_info.state;
            const checkAfterSecs = finalizeResponse.data.processing_info.check_after_secs || 1;

            if (state === 'succeeded') {
                // console.log(`Media FINALIZE successful (succeeded state) for Media ID: ${mediaIdString}`);
            } else if (state === 'pending' || state === 'in_progress') {
                // console.log(`Media FINALIZE for ${mediaIdString} is ${state}. Waiting for ${checkAfterSecs}s.`);
                await new Promise(resolve => setTimeout(resolve, checkAfterSecs * 1000));

                // Check STATUS after waiting
                const statusResponse = await axios.get(`${X_V2_MEDIA_UPLOAD_URL}?command=STATUS&media_id=${mediaIdString}`, {
                    headers: { 'Authorization': `Bearer ${appOnlyAccessToken}` }
                });

                if (statusResponse.data.processing_info && statusResponse.data.processing_info.state === 'succeeded') {
                    // console.log(`Media processing succeeded for ${mediaIdString} after polling.`);
                } else if (statusResponse.data.processing_info && statusResponse.data.processing_info.state === 'failed') {
                    console.error('Media processing failed after polling:', statusResponse.data.processing_info.error);
                    throw new Error(`Media processing failed after polling: ${statusResponse.data.processing_info.error.details || statusResponse.data.processing_info.error.name || 'Unknown error'}`);
                } else if (statusResponse.data.processing_info && (statusResponse.data.processing_info.state === 'pending' || statusResponse.data.processing_info.state === 'in_progress')) {
                    console.warn(`Media processing still ${statusResponse.data.processing_info.state} for ${mediaIdString} after poll.`);
                    throw new Error(`Media processing did not complete in time for ${mediaIdString}. State: ${statusResponse.data.processing_info.state}`);
                } else {
                     console.warn(`Unexpected status check response for ${mediaIdString}:`, statusResponse.data);
                     throw new Error(`Unexpected status check response for ${mediaIdString}.`);
                }
            } else if (state === 'failed') {
                console.error('Media processing failed (initial FINALIZE):', finalizeResponse.data.processing_info.error);
                throw new Error(`Media processing failed: ${finalizeResponse.data.processing_info.error.details || finalizeResponse.data.processing_info.error.name || 'Unknown processing error'}`);
            }
        } else if (finalizeResponse.data.media_id_string) { // media_id_string from FINALIZE, not media_id
            // console.log(`Media FINALIZE for ${mediaIdString} completed directly (media_id_string present).`);
        } else {
            console.warn(`Unexpected FINALIZE response for ${mediaIdString}:`, finalizeResponse.data);
            throw new Error(`Unexpected FINALIZE response for media_id ${mediaIdString}.`);
        }
        return mediaIdString;
    } catch (error) {
        // Preserve specific error messages from the try block if they are already set
        const isSpecificError = error.message.startsWith('Media FINALIZE failed:') ||
                                error.message.startsWith('Media processing failed') ||
                                error.message.startsWith('Unexpected FINALIZE response') ||
                                error.message.startsWith('Media processing did not complete') ||
                                error.message.startsWith('Unexpected status check response');

        const errorMessage = isSpecificError ? error.message : `Media FINALIZE failed: ${error.message}`;
        console.error('Error in Media FINALIZE (overall catch):', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error(errorMessage);
    }
}

async function postImageTweet(text, imageData, imageMimeType, userAccessToken) {
    if (!userAccessToken) throw new Error('User access token is required to post an image tweet.');
    if (!imageData) throw new Error('Image data is required.');
    if (!imageMimeType || typeof imageMimeType !== 'string' || imageMimeType.trim() === '') {
        throw new Error('Image MIME type is required and must be a non-empty string.');
    }
    if (text && typeof text !== 'string') {
        throw new Error('Tweet text must be a string if provided.');
    }
    if (text && text.length > 280) {
        console.warn('Tweet text exceeds 280 characters, potential for API error.');
    }

    try {
        const appOnlyAccessToken = await getAppOnlyBearerToken();
        // console.log('Starting media upload for image tweet...');
        const mediaId = await _uploadMedia(imageData, imageMimeType, appOnlyAccessToken);
        // console.log(`Media upload complete for image tweet. Media ID: ${mediaId}`);

        const tweetData = {
            text: text || '',
            media: {
                media_ids: [mediaId]
            }
        };

        // console.log(`Posting tweet with image. Media ID: ${mediaId}. Text: "${text || ''}"`);
        return await _requestXApi({
            method: 'POST',
            endpoint: 'tweets',
            data: tweetData,
            userAccessToken: userAccessToken
        });
    } catch (error) {
        console.error(`Error in postImageTweet: ${error.message}`);
        throw error;
    }
}


module.exports = {
    initiateXAuthorization,
    handleXAuthorizationCallback,
    searchTweetsByUsername,
    searchRecentTweets,
    postTextTweet,
    postImageTweet,
};
