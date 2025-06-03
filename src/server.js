const express = require('express');
const path = require('path'); // Import the 'path' module
const axios = require('axios'); // For making HTTP requests
const session = require('express-session'); // For session management
const crypto = require('crypto'); // For generating 'state' string
const { google } = require('googleapis'); // Added for Google Drive
const multer = require('multer'); // Added for file uploads
const stream = require('stream'); // Added for Google Drive file upload
const vectorService = require('./services/vectorService'); // Added for embeddings
const { getAgentResponse, initializeAgent } = require('./agent'); // Modified to import initializeAgent
const { generateProjectContextQuestions, structureProjectContextAnswers } = require('./services/geminiService'); // Added for project context
const Project = require('./models/Project');
const Objective = require('./models/Objective');
const dataStore = require('./dataStore');
const app = express();
const port = process.env.PORT || 3000;

// --- OAuth & App Configuration Placeholders ---
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || 'YOUR_FACEBOOK_APP_ID';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || 'YOUR_FACEBOOK_APP_SECRET';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'YOUR_TIKTOK_CLIENT_KEY';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || 'YOUR_TIKTOK_CLIENT_SECRET';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID'; // Added
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET'; // Added
const GOOGLE_REDIRECT_URI = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/auth/google/callback` : `http://localhost:${port}/auth/google/callback`; // Added
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${port}`;

// --- Google OAuth2 Client ---
const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

// --- Multer Configuration (for file uploads) ---
const upload = multer({ storage: multer.memoryStorage() }); // Using memory storage for now

// Middleware to parse JSON bodies
app.use(express.json());

// Session Middleware Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_very_secret_key_for_session_dev', // Replace with a real secret in production
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // For HTTP, set to true if using HTTPS in prod
}));

// Serve static files from the 'public' directory
// Assuming server.js is in src, and public is one level up from src
app.use(express.static(path.join(__dirname, '..', 'public')));

// === SOCIAL MEDIA AUTHENTICATION ROUTES ===

// --- Facebook Auth ---
// Step 1: Redirect user to Facebook for authentication
app.get('/auth/facebook', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'facebook' }; // Store state server-side

    const facebookAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}` +
        `&redirect_uri=${APP_BASE_URL}/auth/facebook/callback` +
        `&scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts` + // Removed pages_manage_ads for now, add if essential
        `&state=${state}` +
        `&response_type=code`;

    res.redirect(facebookAuthUrl);
});

// Step 2: Facebook callback with authorization code
app.get('/auth/facebook/callback', async (req, res) => {
    const { code, state, error: fbError, error_reason: fbErrorReason, error_description: fbErrorDescription } = req.query; // Facebook error params
    const sessionState = req.session[state];

    if (fbError) {
        console.error(`Facebook auth callback error: ${fbError} (${fbErrorReason}) - ${fbErrorDescription}`, req.query);
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+connecting+Facebook:+${encodeURIComponent(fbErrorDescription || 'Authentication_failed')}&status=error`);
    }

    if (!sessionState || !sessionState.initiated || sessionState.service !== 'facebook') {
        console.error('Facebook auth callback error: Invalid state or session expired.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state]; // Clean up potentially partial session
        return res.redirect('/?message=Error+connecting+Facebook:+Invalid+session+or+state&status=error');
    }

    if (!code) {
        console.error('Facebook auth callback error: No code provided, but no error from Facebook.', req.query);
        delete req.session[state]; // Clean up session
        return res.redirect('/?message=Error+connecting+Facebook:+Authentication+code+missing&status=error');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: {
                client_id: FACEBOOK_APP_ID,
                client_secret: FACEBOOK_APP_SECRET,
                redirect_uri: `${APP_BASE_URL}/auth/facebook/callback`,
                code: code
            }
        });

        const userAccessToken = tokenResponse.data.access_token;
        if (!userAccessToken) {
            console.error('Facebook auth callback error: No access token received from Facebook.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+Facebook:+Failed+to+obtain+access+token&status=error');
        }

        // Fetch user's Facebook Pages
        const pagesResponse = await axios.get(`https://graph.facebook.com/me/accounts`, {
            params: { access_token: userAccessToken }
        });

        const pagesData = pagesResponse.data.data; // Array of page objects

        // Store token and pages in session, associated with the state
        req.session[state].fbUserToken = userAccessToken;
        req.session[state].fbPages = pagesData;
        // Also fetch basic user profile to get facebookUserID
        const userProfileResponse = await axios.get(`https://graph.facebook.com/me`, {
            params: { fields: 'id,name,email', access_token: userAccessToken }
        });
        req.session[state].facebookUserID = userProfileResponse.data.id;
        req.session[state].facebookUserEmail = userProfileResponse.data.email; // Optional

        // Redirect to a frontend page to select a Facebook Page
        // This page will then call another backend endpoint to finalize project creation/update
        res.redirect(`/select-facebook-page.html?state=${state}`);

    } catch (error) {
        const errorMessage = error.response && error.response.data && error.response.data.error ?
                             (error.response.data.error.message || JSON.stringify(error.response.data.error)) :
                             error.message;
        console.error('Facebook auth callback processing error:', errorMessage, error.response ? error.response.data : '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+Facebook:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

// --- PROJECT CONTEXT API ENDPOINTS ---

// POST /api/projects/:projectId/context-questions - Generate and store context questions
app.post('/api/projects/:projectId/context-questions', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const questions = await generateProjectContextQuestions(project.name, project.description);

        // Ensure project.projectContextQuestions is initialized if it's not already
        project.projectContextQuestions = questions;

        const updatedProjectResult = dataStore.updateProjectById(projectId, { projectContextQuestions: questions });
        if (!updatedProjectResult) {
             // This case should ideally not happen if findProjectById succeeded
            console.error(`Failed to update project ${projectId} with context questions.`);
            return res.status(500).json({ error: 'Failed to save context questions to project.' });
        }

        res.status(200).json(questions);

    } catch (error) {
        console.error(`Error generating context questions for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to generate project context questions due to a server error.' });
    }
});

// POST /api/projects/:projectId/context-answers - Submit and structure context answers
app.post('/api/projects/:projectId/context-answers', async (req, res) => {
    const { projectId } = req.params;
    const { userAnswersString } = req.body;

    if (!userAnswersString) {
        return res.status(400).json({ error: 'userAnswersString is required in the request body.' });
    }

    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const structuredAnswers = await structureProjectContextAnswers(project.name, project.description, userAnswersString);

        // Ensure project.projectContextAnswers is initialized
        project.projectContextAnswers = structuredAnswers;

        const updatedProjectResult = dataStore.updateProjectById(projectId, { projectContextAnswers: structuredAnswers });
         if (!updatedProjectResult) {
            // This case should ideally not happen if findProjectById succeeded
            console.error(`Failed to update project ${projectId} with structured context answers.`);
            return res.status(500).json({ error: 'Failed to save structured context answers to project.' });
        }

        res.status(200).json({ message: 'Context answers submitted and structured successfully', projectContextAnswers: structuredAnswers });

    } catch (error) {
        console.error(`Error processing context answers for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to process project context answers due to a server error.' });
    }
});

// DELETE /api/projects/:projectId/assets/:assetId - Delete an asset from a project
app.delete('/api/projects/:projectId/assets/:assetId', async (req, res) => {
    const { projectId, assetId } = req.params;

    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const assetIndex = project.assets ? project.assets.findIndex(a => a.assetId === assetId) : -1;
        if (assetIndex === -1) {
            return res.status(404).json({ error: 'Asset not found in project.' });
        }

        const assetToDelete = project.assets[assetIndex];
        const googleDriveFileId = assetToDelete.googleDriveFileId;

        // Attempt to delete from Google Drive if configured
        if (googleDriveFileId && project.googleDriveAccessToken) {
            const driveClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
            driveClient.setCredentials({
                access_token: project.googleDriveAccessToken,
                refresh_token: project.googleDriveRefreshToken,
            });
            const drive = google.drive({ version: 'v3', auth: driveClient });

            try {
                console.log(`Attempting to delete asset ${assetId} (Drive ID: ${googleDriveFileId}) from Google Drive.`);
                await drive.files.delete({ fileId: googleDriveFileId });
                console.log(`Successfully deleted asset ${assetId} from Google Drive.`);
            } catch (driveError) {
                // Log GDrive deletion error but proceed to remove from app's datastore
                console.error(`Failed to delete asset ${assetId} (Drive ID: ${googleDriveFileId}) from Google Drive:`,
                    driveError.response ? driveError.response.data : driveError.message);
                // If it's a critical auth error, maybe we should stop? For now, we'll log and proceed.
                // e.g. if (driveError.code === 401) return res.status(500).json({ error: 'Google Drive auth error during deletion.'});
                if (driveError.response && driveError.response.status === 404) {
                    console.warn(`Asset ${assetId} (Drive ID: ${googleDriveFileId}) not found on Google Drive. Proceeding with local deletion.`);
                } else {
                    // For other errors, we might still want to proceed with local deletion.
                    // Depending on policy, could return an error here.
                }
            }
        } else if (googleDriveFileId) {
            console.warn(`Asset ${assetId} has a Google Drive File ID but project is missing GDrive token. Cannot delete from Drive.`);
        }

        // Remove from Vector Store
        vectorService.removeAssetVector(projectId, assetId);

        // Remove from Project Assets Array in DataStore
        const updatedAssets = project.assets.filter(a => a.assetId !== assetId);
        dataStore.updateProjectById(projectId, { assets: updatedAssets });

        res.status(200).json({ message: 'Asset deleted successfully.' });

    } catch (error) {
        console.error(`Error deleting asset ${assetId} for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to delete asset due to a server error.' });
    }
});

// POST /api/objectives/:objectiveId/plan/approve - Approve the plan for an objective
app.post('/api/objectives/:objectiveId/plan/approve', (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = dataStore.findObjectiveById(objectiveId);

        if (!objective) {
            return res.status(404).json({ error: 'Objective not found to approve plan for' });
        }

        if (!objective.plan) {
            // This case should ideally not be hit if objectives always initialize with a plan structure
            return res.status(404).json({ error: 'Plan not found for this objective. Initialize it first.' });
        }

        objective.plan.status = 'approved';
        objective.updatedAt = new Date(); // Also update the objective's updatedAt timestamp

        // dataStore.updateObjectiveById was already modified to handle plan updates
        const updatedObjective = dataStore.updateObjectiveById(objective.id, objective.title, objective.brief, objective.plan);

        if (!updatedObjective) {
            // This might happen if findObjectiveById found it, but updateObjectiveById failed internally
            // which is unlikely given current dataStore logic but good to be defensive.
            console.error(`Failed to update objective ${objectiveId} after attempting to approve plan.`);
            return res.status(500).json({ error: 'Failed to save approved plan status.' });
        }

        res.status(200).json(updatedObjective);

    } catch (error) {
        console.error(`Error approving plan for objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to approve plan due to a server error.' });
    }
});

// POST /api/objectives/:objectiveId/initialize-agent - Initialize agent and generate plan
app.post('/api/objectives/:objectiveId/initialize-agent', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const updatedObjective = await initializeAgent(objectiveId); // Corrected: use initializeAgent
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error initializing agent for objective ${objectiveId}:`, error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to initialize agent for objective' });
        }
    }
});

// --- TikTok Project Finalization API ---
app.post('/api/tiktok/finalize-project', (req, res) => {
    const { state, projectName, projectDescription } = req.body;

    if (!projectName) { // Specific check for projectName
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!state) {
        return res.status(400).json({ error: 'Missing state field. Cannot finalize project.' });
    }

    const sessionState = req.session[state];
    if (!sessionState ||
        sessionState.service !== 'tiktok' ||
        !sessionState.initiated || // Check initiated flag
        !sessionState.tiktokAccessToken ||
        !sessionState.tiktokUserID
    ) {
        console.error('API /api/tiktok/finalize-project error: Invalid session state or missing TikTok data.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session state or required connection data not found. Please try reconnecting your TikTok account.' });
    }

    try {
        let permissionsArray = [];
        if (sessionState.tiktokScope) {
            permissionsArray = Array.isArray(sessionState.tiktokScope) ? sessionState.tiktokScope : sessionState.tiktokScope.split(',');
        }

        const projectData = {
            name: projectName,
            description: projectDescription || '',
            tiktokAccessToken: sessionState.tiktokAccessToken,
            tiktokUserID: sessionState.tiktokUserID,
            tiktokPermissions: permissionsArray,
        };

        const newProject = dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);

    } catch (error) {
        console.error('Error in POST /api/tiktok/finalize-project while saving project:', error);
        res.status(500).json({ error: 'Failed to save project data. Please try again.' });
    }
});

// --- TikTok Auth ---
// Step 1: Redirect user to TikTok for authentication
app.get('/auth/tiktok', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'tiktok' };

    // TikTok scopes: user.info.basic, video.list, video.upload.
    // ads_management or video.publish.gia might require advanced permissions/developer program levels.
    // For now, using user.info.basic as a starting point.
    const tiktokScope = 'user.info.basic'; // Add more scopes as needed and approved by TikTok

    const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/` +
        `?client_key=${TIKTOK_CLIENT_KEY}` +
        `&scope=${tiktokScope}` +
        `&response_type=code` +
        `&redirect_uri=${APP_BASE_URL}/auth/tiktok/callback` +
        `&state=${state}`;

    res.redirect(tiktokAuthUrl);
});

// Step 2: TikTok callback with authorization code
app.get('/auth/tiktok/callback', async (req, res) => {
    const { code, state, error: tkError, error_description: tkErrorDescription } = req.query; // TikTok error params
    const sessionState = req.session[state];

    if (tkError) {
        console.error(`TikTok auth callback error: ${tkError} - ${tkErrorDescription}`, req.query);
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+connecting+TikTok:+${encodeURIComponent(tkErrorDescription || 'Authentication_failed')}&status=error`);
    }

    if (!sessionState || !sessionState.initiated || sessionState.service !== 'tiktok') {
        console.error('TikTok auth callback error: Invalid state or session expired.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state]; // Clean up
        return res.redirect('/?message=Error+connecting+TikTok:+Invalid+session+or+state&status=error');
    }

    if (!code) {
        console.error('TikTok auth callback error: No code provided, but no error from TikTok.', req.query);
        delete req.session[state]; // Clean up
        return res.redirect('/?message=Error+connecting+TikTok:+Authentication+code+missing&status=error');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post(`https://open.tiktokapis.com/v2/oauth/token/`, new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY,
            client_secret: TIKTOK_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: `${APP_BASE_URL}/auth/tiktok/callback`
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token, open_id, scope, expires_in } = tokenResponse.data;

        if (!access_token || !open_id) {
            console.error('TikTok auth callback error: No access_token or open_id received.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+TikTok:+Failed+to+obtain+access+token&status=error');
        }

        // Store TikTok tokens and user info in session
        req.session[state].tiktokAccessToken = access_token;
        req.session[state].tiktokRefreshToken = refresh_token;
        req.session[state].tiktokUserID = open_id;
        req.session[state].tiktokScope = scope;
        req.session[state].tiktokExpiresIn = expires_in;

        // Redirect to a common frontend page that will handle finalization
        // This page will fetch project name/desc from sessionStorage and POST to a new backend endpoint
        res.redirect(`/finalize-project.html?state=${state}&service=tiktok`);

    } catch (error) {
        const errorMessage = error.response && error.response.data && error.response.data.error_description ?
                             error.response.data.error_description :
                             (error.response && error.response.data && error.response.data.error ? error.response.data.error : error.message);
        console.error('TikTok auth callback processing error:', errorMessage, error.response ? error.response.data : '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+TikTok:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

// --- Google Drive Auth ---
// Step 1: Initiate Google Drive authentication
app.get('/auth/google/initiate', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) {
        return res.status(400).send('Project ID is required');
    }
    // Store projectId in session to use it in the callback
    req.session.gDriveProjectId = projectId;

    const scopes = [
        'https://www.googleapis.com/auth/drive.file', // Full access to files created by an app
        'https://www.googleapis.com/auth/userinfo.profile' // Basic profile info
    ];

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request a refresh token
        scope: scopes,
        // A unique state value should be used to prevent CSRF attacks, similar to Facebook/TikTok
        // For simplicity in this example, it's omitted but recommended for production
    });
    res.redirect(authUrl);
});

// Step 2: Google Drive callback with authorization code
app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    const projectId = req.session.gDriveProjectId;

    if (error) {
        console.error('Google Auth callback error:', error);
        delete req.session.gDriveProjectId; // Clean up session
        return res.redirect(`/?message=Error+connecting+Google+Drive:+${encodeURIComponent(error)}&status=error`);
    }

    if (!code) {
        delete req.session.gDriveProjectId; // Clean up session
        return res.redirect('/?message=Error+connecting+Google+Drive:+Authorization+code+missing&status=error');
    }

    if (!projectId) {
        // This case might happen if the session expired or was lost.
        console.error('Google Auth callback: Project ID missing from session.');
        return res.redirect('/?message=Error+connecting+Google+Drive:+Project+ID+missing+from+session.+Please+try+again.&status=error');
    }

    try {
        // 1. Token Exchange
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // 2. Get Project Details
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            console.error(`Google Auth Callback: Project not found with ID: ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Project+not+found&status=error`);
        }

        // 3. Create Google Drive Service Client
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const parentFolderName = "marketing-agent";
        let parentFolderId;

        // 4. Check/Create "marketing-agent" Parent Folder
        const folderQuery = `name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
        const { data: { files: existingFolders } } = await drive.files.list({ q: folderQuery, fields: 'files(id, name)' });

        if (existingFolders && existingFolders.length > 0) {
            parentFolderId = existingFolders[0].id;
        } else {
            const fileMetadata = {
                name: parentFolderName,
                mimeType: 'application/vnd.google-apps.folder',
            };
            const { data: newFolder } = await drive.files.create({
                resource: fileMetadata,
                fields: 'id',
            });
            parentFolderId = newFolder.id;
        }

        if (!parentFolderId) {
            console.error(`Google Auth Callback: Failed to find or create parent folder '${parentFolderName}' for project ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Could+not+establish+parent+folder&status=error&projectId=${projectId}`);
        }

        // 5. Create Project-Specific Folder
        const projectFolderName = project.name; // Use project's name for the folder
        const projectFolderMetadata = {
            name: projectFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };
        const { data: newProjectFolder } = await drive.files.create({
            resource: projectFolderMetadata,
            fields: 'id',
        });
        const googleDriveFolderId = newProjectFolder.id;

        if (!googleDriveFolderId) {
            console.error(`Google Auth Callback: Failed to create project-specific folder for project ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Could+not+create+project+folder&status=error&projectId=${projectId}`);
        }

        // 6. Update Project in DataStore
        const updateData = {
            googleDriveFolderId: googleDriveFolderId,
            googleDriveAccessToken: tokens.access_token,
        };
        if (tokens.refresh_token) {
            updateData.googleDriveRefreshToken = tokens.refresh_token;
        }
        const updatedProject = dataStore.updateProjectById(projectId, updateData);

        if (!updatedProject) {
            // This is unlikely if findProjectById succeeded, but good to check
            console.error(`Google Auth Callback: Failed to update project ${projectId} in DataStore after GDrive setup.`);
            // Note: At this point, folders are created on GDrive. Manual cleanup might be needed or a rollback mechanism.
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Failed+to+save+Drive+details+to+project&status=error&projectId=${projectId}`);
        }

        // 7. Redirect
        delete req.session.gDriveProjectId; // Clean up session
        res.redirect(`/project-details.html?projectId=${projectId}&gdriveStatus=success`); // Redirect to project details or a settings page

    } catch (err) {
        console.error(`Google Auth Callback Error for projectId ${projectId}:`, err.response ? err.response.data : err.message, err.stack);
        delete req.session.gDriveProjectId; // Clean up session
        const errorMessage = err.response && err.response.data && err.response.data.error_description
            ? err.response.data.error_description
            : (err.response && err.response.data && err.response.data.error ? err.response.data.error : 'Failed to process Google authentication.');
        return res.redirect(`/?message=Error+Google+Drive+setup:+${encodeURIComponent(errorMessage)}&status=error&projectId=${projectId}`);
    }
});

// --- Facebook Page Selection & Project Finalization API ---

// GET /api/facebook/pages - Retrieve pages stored in session after Facebook auth
app.get('/api/facebook/pages', (req, res) => {
    const { state } = req.query;
    if (!state) {
        return res.status(400).json({ error: 'State parameter is missing. Cannot retrieve pages.' });
    }

    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'facebook' || !sessionState.fbPages) {
        console.error('API /api/facebook/pages error: Invalid session state or Facebook pages not found.', { queryState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session state or Facebook pages not found. Please try reconnecting your Facebook account.' });
    }

    // fbPages should be an array of page objects {id, name, access_token, perms}
    res.json(sessionState.fbPages);
});

// POST /api/facebook/finalize-project - Create/update project with Facebook details
app.post('/api/facebook/finalize-project', (req, res) => {
    const { state, selectedPageID, projectName, projectDescription } = req.body;

    if (!projectName) { // Specific check for projectName
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!state || !selectedPageID) {
        return res.status(400).json({ error: 'Missing required fields: state or selectedPageID.' });
    }

    const sessionState = req.session[state];
    if (!sessionState ||
        sessionState.service !== 'facebook' ||
        !sessionState.initiated || // Check initiated flag
        !sessionState.fbUserToken ||
        !sessionState.facebookUserID ||
        !sessionState.fbPages) {
        console.error('API /api/facebook/finalize-project error: Invalid session state or missing Facebook data.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session state or required connection data not found. Please try reconnecting your Facebook account.' });
    }

    const selectedPage = sessionState.fbPages.find(page => page.id === selectedPageID);
    if (!selectedPage) {
        return res.status(404).json({ error: 'Selected Facebook Page not found in your session data. Please ensure the page was correctly selected or try reconnecting.' });
    }

    try {
        const projectData = {
            name: projectName,
            description: projectDescription || '',
            facebookUserAccessToken: sessionState.fbUserToken,
            facebookUserID: sessionState.facebookUserID,
            facebookSelectedPageID: selectedPageID,
            facebookPageName: selectedPage.name,
            facebookPageAccessToken: selectedPage.access_token,
            facebookPermissions: selectedPage.perms || []
        };

        const newProject = dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);

    } catch (error) {
        console.error('Error in POST /api/facebook/finalize-project while saving project:', error);
        res.status(500).json({ error: 'Failed to save project data. Please try again.' });
    }
});


// === PROJECT API ENDPOINTS ===

// POST /api/projects - Create a new project
app.post('/api/projects', (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    try {
        // Note: This endpoint creates a project WITHOUT social media details.
        // The `addProject` function in dataStore.js should correctly initialize
        // social media fields to their defaults (null or []) if they are not provided,
        // which is the case here.
        const projectData = { name, description };
        const newProject = dataStore.addProject(projectData);
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error creating project via POST /api/projects:', error);
        res.status(500).json({ error: 'Failed to create project. Please try again.' });
    }
});

// GET /api/projects - Get all projects
app.get('/api/projects', (req, res) => {
    try {
        const projects = dataStore.getAllProjects();
        res.status(200).json(projects);
    } catch (error) {
        console.error('Error getting projects:', error);
        res.status(500).json({ error: 'Failed to retrieve projects' });
    }
});

// GET /api/projects/:projectId - Get a specific project
app.get('/api/projects/:projectId', (req, res) => {
    const { projectId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(200).json(project);
    } catch (error) {
        console.error(`Error getting project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve project' });
    }
});

// PUT /api/projects/:projectId - Update a project
app.put('/api/projects/:projectId', (req, res) => {
    const { projectId } = req.params;
    const { name, description } = req.body;

    if (name === undefined && description === undefined) { // Check if both are undefined
        return res.status(400).json({ error: 'At least name or description must be provided for update' });
    }

    try {
        const updatedProject = dataStore.updateProjectById(projectId, name, description);
        if (!updatedProject) {
            return res.status(404).json({ error: 'Project not found for update' });
        }
        res.status(200).json(updatedProject);
    } catch (error) {
        console.error(`Error updating project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// DELETE /api/projects/:projectId - Delete a project
app.delete('/api/projects/:projectId', (req, res) => {
    const { projectId } = req.params;
    try {
        const success = dataStore.deleteProjectById(projectId);
        if (!success) {
            return res.status(404).json({ error: 'Project not found for deletion' });
        }
        res.status(200).json({ message: 'Project and associated objectives deleted successfully' });
    } catch (error) {
        console.error(`Error deleting project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// --- Project Assets API Endpoints ---

// GET /api/projects/:projectId/assets - List all assets for a project
app.get('/api/projects/:projectId/assets', (req, res) => {
    const { projectId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        const assets = project.assets || [];
        res.status(200).json(assets);
    } catch (error) {
        console.error(`Error listing assets for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to list project assets due to a server error.' });
    }
});

// POST /api/projects/:projectId/assets/upload - Upload a new asset for a project
app.post('/api/projects/:projectId/assets/upload', upload.single('assetFile'), async (req, res) => {
    const { projectId } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        if (!project.googleDriveFolderId || !project.googleDriveAccessToken) {
            return res.status(400).json({ error: 'Google Drive is not configured for this project. Please connect Google Drive first.' });
        }

        // 1. Initialize OAuth2Client for Drive API
        // Note: The global oauth2Client is for the initial auth flow.
        // For API calls, we might need to re-initialize or ensure it's correctly set up
        // with the project's specific tokens, especially if handling multiple users/projects.
        // For simplicity, re-creating and setting credentials here for clarity.
        const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        client.setCredentials({
            access_token: project.googleDriveAccessToken,
            refresh_token: project.googleDriveRefreshToken, // May be null if not obtained/stored
        });
        const drive = google.drive({ version: 'v3', auth: client });

        // 2. Prepare File Metadata
        const fileMetadata = {
            name: req.file.originalname,
            parents: [project.googleDriveFolderId],
        };

        // 3. Prepare Media
        const media = {
            mimeType: req.file.mimetype,
            body: stream.Readable.from(req.file.buffer),
        };

        // 4. Upload to Google Drive
        const uploadedFile = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, mimeType', // Fields to retrieve about the uploaded file
        });

        // 5. Generate Asset ID
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Call vectorization service
        const assetNameForEmbedding = uploadedFile.data.name;
        const { vector, tags } = await vectorService.generateEmbedding(assetNameForEmbedding);

        // 6. Create Asset Object
        const newAsset = {
            assetId,
            name: uploadedFile.data.name,
            type: uploadedFile.data.mimeType,
            googleDriveFileId: uploadedFile.data.id,
            vector: vector, // Store the generated vector
            tags: tags,     // Store the generated tags
        };

        // 7. Update Project's Assets Array
        const updatedAssets = [...(project.assets || []), newAsset]; // Ensure project.assets is an array
        dataStore.updateProjectById(projectId, { assets: updatedAssets });

        // Add asset vector to in-memory store
        vectorService.addAssetVector(projectId, newAsset.assetId, newAsset.vector);

        // 8. Respond
        res.status(201).json(newAsset);

    } catch (error) {
        console.error(`Error processing file upload for project ${projectId}:`, error.response ? error.response.data : error.message, error.stack);
        if (error.response && error.response.data && error.response.data.error) {
            const gError = error.response.data.error;
            if (gError.code === 401 || (gError.errors && gError.errors.some(e => e.reason === 'authError'))) {
                 return res.status(401).json({ error: 'Google Drive authentication error. Please reconnect Google Drive.', details: gError.message });
            }
            return res.status(500).json({ error: `Google Drive API error: ${gError.message}`, details: gError.errors });
        }
        res.status(500).json({ error: 'Failed to upload file to Google Drive due to a server error.' });
    }
});


// === OBJECTIVE API ENDPOINTS ===

// POST /api/projects/:projectId/objectives - Create a new objective for a project
app.post('/api/projects/:projectId/objectives', (req, res) => {
    const { projectId } = req.params;
    const { title, brief } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Objective title is required' });
    }

    const project = dataStore.findProjectById(projectId);
    if (!project) {
        return res.status(404).json({ error: 'Project not found to add objective to' });
    }

    try {
        const newObjective = new Objective(projectId, title, brief);
        const savedObjective = dataStore.addObjective(newObjective);
        res.status(201).json(savedObjective);
    } catch (error) {
        console.error(`Error creating objective for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to create objective' });
    }
});

// GET /api/projects/:projectId/objectives - Get all objectives for a project
app.get('/api/projects/:projectId/objectives', (req, res) => {
    const { projectId } = req.params;
    const project = dataStore.findProjectById(projectId);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }
    try {
        const objectives = dataStore.getObjectivesByProjectId(projectId);
        res.status(200).json(objectives);
    } catch (error) { // Fixed: Added opening curly brace
        console.error(`Error getting objectives for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objectives' });
    }
});

// GET /api/objectives/:objectiveId - Get a specific objective
app.get('/api/objectives/:objectiveId', (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = dataStore.findObjectiveById(objectiveId);
        if (!objective) {
            return res.status(404).json({ error: 'Objective not found' });
        }
        res.status(200).json(objective);
    } catch (error) {
        console.error(`Error getting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objective' });
    }
});

// PUT /api/objectives/:objectiveId - Update an objective
app.put('/api/objectives/:objectiveId', (req, res) => {
    const { objectiveId } = req.params;
    const { title, brief } = req.body;

    if (title === undefined && brief === undefined) {
        return res.status(400).json({ error: 'At least title or brief must be provided for update' });
    }

    try {
        const updatedObjective = dataStore.updateObjectiveById(objectiveId, title, brief);
        if (!updatedObjective) {
            return res.status(404).json({ error: 'Objective not found for update' });
        }
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error updating objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to update objective' });
    }
});

// DELETE /api/objectives/:objectiveId - Delete an objective
app.delete('/api/objectives/:objectiveId', (req, res) => {
    const { objectiveId } = req.params;
    try {
        const success = dataStore.deleteObjectiveById(objectiveId);
        if (!success) {
            return res.status(404).json({ error: 'Objective not found for deletion' });
        }
        res.status(200).json({ message: 'Objective deleted successfully' });
    } catch (error) {
        console.error(`Error deleting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to delete objective' });
    }
});

// === OBJECTIVE CHAT API ENDPOINT ===
app.post('/api/objectives/:objectiveId/chat', async (req, res) => {
    const { objectiveId } = req.params;
    const { userInput } = req.body;

    if (!userInput) {
        return res.status(400).json({ error: 'userInput is required' });
    }

    try {
        const objective = dataStore.findObjectiveById(objectiveId);
        if (!objective) {
            return res.status(404).json({ error: 'Objective not found' });
        }

        // Get agent response using the objective's specific chat history
        const agentResponse = await getAgentResponse(userInput, objective.chatHistory, objectiveId);

        // Add user message to objective's chat history
        dataStore.addMessageToObjectiveChat(objectiveId, 'user', userInput);
        // Add agent response to objective's chat history
        dataStore.addMessageToObjectiveChat(objectiveId, 'agent', agentResponse);

        res.json({ response: agentResponse });

    } catch (error) {
        console.error(`Error in objective chat for ${objectiveId}:`, error);
        // Check if the error is from the agent itself or a general server error
        if (error.message.startsWith('Agent:')) { // Assuming agent errors are prefixed
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to get agent response for objective' });
        }
    }
});

// === Original Chat API endpoint (to be DEPRECATED or modified later if needed) ===
// app.post('/api/chat', async (req, res) => { ... }); // Keep it for now but it won't be used by new UI
app.post('/api/chat', async (req, res) => {
  try {
    const { userInput, chatHistory } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    // chatHistory can be optional or defaults to an empty array if not provided
    const history = chatHistory || [];

    // For this generic /api/chat endpoint, there's no objectiveId.
    // The getAgentResponse now requires it. This endpoint is problematic.
    // For now, I'll pass null or undefined, and getAgentResponse will handle it by returning an error message.
    // This endpoint should likely be removed or re-thought if objective-specific context is always required.
    const agentResponse = await getAgentResponse(userInput, history, null);
    res.json({ response: agentResponse });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to get agent response' });
  }
});

// All other GET requests not handled by the static middleware or API routes
// should serve the main client application (index.html).
// This is important for single-page applications (SPAs) and PWA navigation.
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log('PWA client should be accessible at http://localhost:${port}/');
});
