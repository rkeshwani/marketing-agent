// src/services/googleAuthService.js
const { google } = require('googleapis');
const config = require('../config/config'); // Adjust path as necessary
const dataStore = require('../dataStore'); // Adjust path as necessary

const oauth2Client = new google.auth.OAuth2(
  config.GOOGLE_OAUTH_CLIENT_ID,
  config.GOOGLE_OAUTH_CLIENT_SECRET,
  config.GOOGLE_OAUTH_REDIRECT_URI
);

/**
 * Generates the Google OAuth 2.0 Authorization URL.
 * @param {string} projectId - The ID of the project initiating the auth. Used for state.
 * @returns {string} The authorization URL.
 */
function generateAuthUrl(projectId) {
  const scopes = config.GOOGLE_SEARCH_CONSOLE_SCOPES;
  const state = projectId; // Using projectId as state to identify the user/project upon callback

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Important to get a refresh token
    scope: scopes,
    state: state, // Pass the projectId in the state parameter
  });
  return authUrl;
}

/**
 * Handles the OAuth 2.0 callback from Google.
 * Exchanges the authorization code for tokens and stores them.
 * @param {string} code - The authorization code from Google.
 * @param {string} state - The state parameter received from Google (should be projectId).
 * @returns {Promise<boolean>} True if tokens were successfully obtained and stored, false otherwise.
 */
async function handleOAuthCallback(code, state) {
  // Placeholder - Implementation will follow
  console.log(`Received OAuth callback with code: ${code} and state: ${state}`);
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('Tokens obtained:', tokens);

    const projectId = state; // Assuming state is the projectId as set in generateAuthUrl
    const project = dataStore.findProjectById(projectId);

    if (!project) {
      console.error(`Project not found for ID: ${projectId} in OAuth callback.`);
      return false;
    }

    project.googleSearchConsoleAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      // Refresh token is only provided on the first authorization
      project.googleSearchConsoleRefreshToken = tokens.refresh_token;
    }
    project.googleSearchConsoleScopes = tokens.scope ? tokens.scope.split(' ') : config.GOOGLE_SEARCH_CONSOLE_SCOPES;
    project.updatedAt = new Date();

    dataStore.updateProjectById(projectId, project); // Ensure this method saves the entire updated project object or specific fields
    console.log(`Successfully stored Google Search Console tokens for project ${projectId}.`);
    return true;

  } catch (error) {
    console.error('Error exchanging authorization code for tokens:', error.message);
    return false;
  }
}

/**
 * Refreshes an expired access token using the refresh token.
 * @param {string} projectId - The ID of the project whose token needs refreshing.
 * @returns {Promise<string|null>} The new access token, or null if refresh fails.
 */
async function refreshAccessToken(projectId) {
  // Placeholder - Implementation will follow
  const project = dataStore.findProjectById(projectId);
  if (!project || !project.googleSearchConsoleRefreshToken) {
    console.error(`No refresh token found for project ${projectId} to refresh access token.`);
    return null;
  }

  oauth2Client.setCredentials({
    refresh_token: project.googleSearchConsoleRefreshToken
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('Access token refreshed:', credentials);

    project.googleSearchConsoleAccessToken = credentials.access_token;
    // Note: A new refresh token might sometimes be returned, handle if necessary
    if (credentials.refresh_token) {
        project.googleSearchConsoleRefreshToken = credentials.refresh_token;
    }
    project.updatedAt = new Date();
    dataStore.updateProjectById(projectId, project); // Save updated tokens

    return credentials.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
    // Potentially handle invalid_grant error differently (e.g., prompt re-authentication)
    return null;
  }
}

/**
 * Retrieves a valid access token for the project.
 * If the current token is expired, it attempts to refresh it.
 * @param {string} projectId - The ID of the project.
 * @returns {Promise<string|null>} A valid access token or null if unable to retrieve/refresh.
 */
async function getValidAccessToken(projectId) {
    const project = dataStore.findProjectById(projectId);
    if (!project) {
        console.error(`Project with ID ${projectId} not found.`);
        return null;
    }

    if (!project.googleSearchConsoleAccessToken && !project.googleSearchConsoleRefreshToken) {
        console.log(`Project ${projectId} has no Google Search Console tokens. Needs authorization.`);
        return null; // Needs authorization
    }

    // This is a simplified check. Actual token expiry should be checked.
    // For now, we assume if a token exists, we try to use it.
    // The googleapis library client might handle token expiry and refresh automatically if configured correctly,
    // or we might need to parse the expiry_date from `tokens` object if available.
    // For robustness, one would check if (oauth2Client.isTokenExpiring() or !project.googleSearchConsoleAccessToken)
    // For this step, we'll rely on refreshing if an API call fails with an auth error,
    // or implement a more proactive refresh in a later step if needed.
    // For now, let's assume we might need to refresh.

    if (!project.googleSearchConsoleAccessToken) { // If no access token, try to refresh if refresh token exists
        if (project.googleSearchConsoleRefreshToken) {
            console.log(`Project ${projectId}: Access token missing, attempting refresh.`);
            return await refreshAccessToken(projectId);
        } else {
            console.log(`Project ${projectId}: No access or refresh token. Needs authorization.`);
            return null;
        }
    }

    // If access token exists, set it on the client and assume it's valid for now.
    // The client will use this. If it's expired, API calls will fail,
    // and that's when we'd ideally call refreshAccessToken.
    oauth2Client.setCredentials({
        access_token: project.googleSearchConsoleAccessToken,
        refresh_token: project.googleSearchConsoleRefreshToken // Also set refresh token for potential auto-refresh by library
    });

    // A more complete solution would involve checking token expiry before returning.
    // For example, if (oauth2Client.isTokenExpiring()) { return await refreshAccessToken(projectId); }
    // The googleapis client should automatically use the refresh token if it's set and the access token is expired.

    return project.googleSearchConsoleAccessToken;
}


module.exports = {
  generateAuthUrl,
  handleOAuthCallback,
  refreshAccessToken,
  getValidAccessToken,
  oauth2Client // Exporting the client itself can be useful for other services
};
