const express = require('express');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');
const { google } = require('googleapis');
const multer = require('multer');
// Removed 'stream' import as it's not directly used here anymore after CopilotKit logic moved
const vectorService = require('./services/vectorService');
// Agent related imports are no longer needed here as CopilotKit logic is in Next.js
// const { getAgentResponse, initializeAgent, agent } = require('./agent');
const { generateProjectContextQuestions, structureProjectContextAnswers } = require('./services/geminiService');
const Project = require('./models/Project');
const Objective = require('./models/Objective');
const dataStore = require('./dataStore');
const SchedulerService = require('./services/schedulerService');
const app = express();
const port = process.env.PORT || 3000;

// CopilotKit Backend Imports are no longer needed here
// const { CopilotRuntime } = require('@copilotkit/backend');

// --- Initialize Scheduler ---
const schedulerServiceInstance = new SchedulerService(dataStore);
const SCHEDULER_INTERVAL_MS = 60 * 1000;

// --- OAuth & App Configuration Placeholders ---
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || 'YOUR_FACEBOOK_APP_ID';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || 'YOUR_FACEBOOK_APP_SECRET';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || 'YOUR_TIKTOK_CLIENT_KEY';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || 'YOUR_TIKTOK_CLIENT_SECRET';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';
const GOOGLE_REDIRECT_URI = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/auth/google/callback` : `http://localhost:${port}/auth/google/callback`;

const config = require('./config/config');
const LINKEDIN_APP_ID = config.LINKEDIN_APP_ID || 'YOUR_LINKEDIN_APP_ID';
const LINKEDIN_APP_SECRET = config.LINKEDIN_APP_SECRET || 'YOUR_LINKEDIN_APP_SECRET';
const LINKEDIN_REDIRECT_URI = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/auth/linkedin/callback` : `http://localhost:${port}/auth/linkedin/callback`;
const LINKEDIN_SCOPES = 'r_liteprofile r_emailaddress w_member_social';

const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${port}`;

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_very_secret_key_for_session_dev',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- REMOVED CopilotKit Agent API Endpoint FROM HERE ---
// app.all('/api/agent', ...);
// This is now handled by next_app/src/app/api/agent/route.js


// Serve static files from the OLD 'public' directory (for any remaining static assets like finalize-project.html)
// This might need to be removed if ALL client serving is handled by Next.js
app.use(express.static(path.join(__dirname, '..', 'public')));

// === SOCIAL MEDIA AUTHENTICATION ROUTES ===
// ... (Existing social media auth routes remain unchanged) ...
app.get('/auth/linkedin', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'linkedin' };
    const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
        `&client_id=${LINKEDIN_APP_ID}` +
        `&redirect_uri=${LINKEDIN_REDIRECT_URI}` +
        `&state=${state}` +
        `&scope=${LINKEDIN_SCOPES}`;
    res.redirect(linkedinAuthUrl);
});

app.get('/auth/linkedin/callback', async (req, res) => {
    const { code, state, error: liError, error_description: liErrorDescription } = req.query;
    const sessionState = req.session[state];
    if (liError) {
        console.error(`LinkedIn auth callback error: ${liError} - ${liErrorDescription}`, req.query);
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+connecting+LinkedIn:+${encodeURIComponent(liErrorDescription || 'Authentication_failed')}&status=error`);
    }
    if (!sessionState || !sessionState.initiated || sessionState.service !== 'linkedin') {
        console.error('LinkedIn auth callback error: Invalid state or session expired.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+LinkedIn:+Invalid+session+or+state&status=error');
    }
    if (!code) {
        console.error('LinkedIn auth callback error: No code provided, but no error from LinkedIn.', req.query);
        delete req.session[state];
        return res.redirect('/?message=Error+connecting+LinkedIn:+Authentication+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.post(`https://www.linkedin.com/oauth/v2/accessToken`, new URLSearchParams({
            grant_type: 'authorization_code', code: code, redirect_uri: LINKEDIN_REDIRECT_URI,
            client_id: LINKEDIN_APP_ID, client_secret: LINKEDIN_APP_SECRET
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            console.error('LinkedIn auth callback error: No access token received.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+LinkedIn:+Failed+to+obtain+access+token&status=error');
        }
        const profileResponse = await axios.get(`https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const emailResponse = await axios.get(`https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        req.session[state].linkedinAccessToken = accessToken;
        req.session[state].linkedinUserID = profileResponse.data.id;
        req.session[state].linkedinUserFirstName = profileResponse.data.localizedFirstName;
        req.session[state].linkedinUserLastName = profileResponse.data.localizedLastName;
        req.session[state].linkedinUserEmail = emailResponse.data.elements[0]['handle~'].emailAddress;
        res.redirect(`/finalize-project.html?state=${state}&service=linkedin`);
    } catch (error) {
        const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
        console.error('LinkedIn auth callback processing error:', errorMessage, error.response?.data || '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+LinkedIn:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

app.post('/api/linkedin/finalize-project', async (req, res) => {
    const { state, projectName, projectDescription } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Project name is required.' });
    if (!state) return res.status(400).json({ error: 'Missing state field.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'linkedin' || !sessionState.initiated || !sessionState.linkedinAccessToken || !sessionState.linkedinUserID) {
        console.error('API /api/linkedin/finalize-project error: Invalid session state.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session or LinkedIn data missing.' });
    }
    try {
        const projectData = {
            name: projectName, description: projectDescription || '',
            linkedinAccessToken: sessionState.linkedinAccessToken, linkedinUserID: sessionState.linkedinUserID,
            linkedinUserFirstName: sessionState.linkedinUserFirstName, linkedinUserLastName: sessionState.linkedinUserLastName,
            linkedinUserEmail: sessionState.linkedinUserEmail, linkedinPermissions: LINKEDIN_SCOPES ? LINKEDIN_SCOPES.split(' ') : [],
        };
        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error in POST /api/linkedin/finalize-project:', error);
        res.status(500).json({ error: 'Failed to save LinkedIn project.' });
    }
});

app.get('/auth/facebook', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'facebook' };
    const facebookAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}` +
        `&redirect_uri=${APP_BASE_URL}/auth/facebook/callback` +
        `&scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts` +
        `&state=${state}&response_type=code`;
    res.redirect(facebookAuthUrl);
});

app.get('/auth/facebook/callback', async (req, res) => {
    const { code, state, error: fbError, error_reason: fbErrorReason, error_description: fbErrorDescription } = req.query;
    const sessionState = req.session[state];
    if (fbError) {
        console.error(`Facebook auth callback error: ${fbError} (${fbErrorReason}) - ${fbErrorDescription}`, req.query);
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+connecting+Facebook:+${encodeURIComponent(fbErrorDescription || 'Authentication_failed')}&status=error`);
    }
    if (!sessionState || !sessionState.initiated || sessionState.service !== 'facebook') {
        console.error('Facebook auth callback error: Invalid state.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+Facebook:+Invalid+session+or+state&status=error');
    }
    if (!code) {
        console.error('Facebook auth callback error: No code provided.', req.query);
        delete req.session[state];
        return res.redirect('/?message=Error+connecting+Facebook:+Authentication+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: { client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET, redirect_uri: `${APP_BASE_URL}/auth/facebook/callback`, code }
        });
        const userAccessToken = tokenResponse.data.access_token;
        if (!userAccessToken) {
            console.error('Facebook auth callback error: No access token.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+Facebook:+Failed+to+obtain+access+token&status=error');
        }
        const pagesResponse = await axios.get(`https://graph.facebook.com/me/accounts`, { params: { access_token: userAccessToken } });
        const userProfileResponse = await axios.get(`https://graph.facebook.com/me`, { params: { fields: 'id,name,email', access_token: userAccessToken } });
        req.session[state].fbUserToken = userAccessToken;
        req.session[state].fbPages = pagesResponse.data.data;
        req.session[state].facebookUserID = userProfileResponse.data.id;
        req.session[state].facebookUserEmail = userProfileResponse.data.email;
        res.redirect(`/select-facebook-page.html?state=${state}`);
    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || JSON.stringify(error.response?.data?.error) || error.message;
        console.error('Facebook auth callback processing error:', errorMessage, error.response?.data || '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+Facebook:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

app.post('/api/projects/:projectId/context-questions', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const questions = await generateProjectContextQuestions(project.name, project.description);
        project.projectContextQuestions = questions;
        const updatedProjectResult = await dataStore.updateProjectById(projectId, { projectContextQuestions: questions });
        if (!updatedProjectResult) return res.status(500).json({ error: 'Failed to save context questions.' });
        res.status(200).json(questions);
    } catch (error) {
        console.error(`Error generating context questions for project ${projectId}:`, error);
        res.status(500).json({ error: 'Server error generating context questions.' });
    }
});

app.post('/api/projects/:projectId/context-answers', async (req, res) => {
    const { projectId } = req.params;
    const { userAnswersString } = req.body;
    if (!userAnswersString) return res.status(400).json({ error: 'userAnswersString is required.' });
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const structuredAnswers = await structureProjectContextAnswers(project.name, project.description, userAnswersString);
        project.projectContextAnswers = structuredAnswers;
        const updatedProjectResult = await dataStore.updateProjectById(projectId, { projectContextAnswers: structuredAnswers });
         if (!updatedProjectResult) return res.status(500).json({ error: 'Failed to save context answers.' });
        res.status(200).json({ message: 'Context answers submitted successfully', projectContextAnswers: structuredAnswers });
    } catch (error) {
        console.error(`Error processing context answers for project ${projectId}:`, error);
        res.status(500).json({ error: 'Server error processing context answers.' });
    }
});

app.delete('/api/projects/:projectId/assets/:assetId', async (req, res) => {
    const { projectId, assetId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });
        const assetIndex = project.assets ? project.assets.findIndex(a => a.assetId === assetId) : -1;
        if (assetIndex === -1) return res.status(404).json({ error: 'Asset not found.' });
        const assetToDelete = project.assets[assetIndex];
        const googleDriveFileId = assetToDelete.googleDriveFileId;
        if (googleDriveFileId && project.googleDriveAccessToken) {
            const driveClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
            driveClient.setCredentials({ access_token: project.googleDriveAccessToken, refresh_token: project.googleDriveRefreshToken });
            const drive = google.drive({ version: 'v3', auth: driveClient });
            try {
                await drive.files.delete({ fileId: googleDriveFileId });
            } catch (driveError) {
                console.error(`GDrive delete error for asset ${assetId}:`, driveError.response?.data || driveError.message);
                if (driveError.response?.status === 404) console.warn(`Asset not found on GDrive.`);
            }
        } else if (googleDriveFileId) {
            console.warn(`Asset ${assetId} GDrive ID exists but no project token.`);
        }
        vectorService.removeAssetVector(projectId, assetId);
        const updatedAssets = project.assets.filter(a => a.assetId !== assetId);
        await dataStore.updateProjectById(projectId, { assets: updatedAssets });
        res.status(200).json({ message: 'Asset deleted.' });
    } catch (error) {
        console.error(`Error deleting asset ${assetId} for project ${projectId}:`, error);
        res.status(500).json({ error: 'Server error deleting asset.' });
    }
});

app.post('/api/objectives/:objectiveId/plan/approve', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective || !objective.plan) return res.status(404).json({ error: 'Objective or plan not found.' });
        objective.plan.status = 'approved';
        objective.updatedAt = new Date();
        const updatedObjective = await dataStore.updateObjectiveById(objective.id, { plan: objective.plan, updatedAt: objective.updatedAt });
        if (!updatedObjective) return res.status(500).json({ error: 'Failed to save approved plan.' });
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error approving plan for objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Server error approving plan.' });
    }
});

app.post('/api/objectives/:objectiveId/initialize-agent', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        // initializeAgent is now part of the Next.js /api/agent endpoint or direct agent interaction
        // This endpoint might be redundant if client directly uses CopilotKit for objective initialization
        // For now, keeping its original call structure if it's still used by old client paths or for direct init.
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective) return res.status(404).json({ error: 'Objective not found' });

        // This call might need to be refactored if initializeAgent's core logic moves
        // or if it's meant to be triggered by CopilotKit interactions.
        const updatedObjective = await initializeAgent(objectiveId);
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error initializing agent for objective ${objectiveId}:`, error);
        res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
    }
});

app.post('/api/tiktok/finalize-project', async (req, res) => {
    const { state, projectName, projectDescription } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Project name is required.' });
    if (!state) return res.status(400).json({ error: 'Missing state field.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'tiktok' || !sessionState.initiated || !sessionState.tiktokAccessToken || !sessionState.tiktokUserID) {
        console.error('API /api/tiktok/finalize-project error: Invalid session state.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session or TikTok data missing.' });
    }
    try {
        const permissionsArray = sessionState.tiktokScope ? (Array.isArray(sessionState.tiktokScope) ? sessionState.tiktokScope : sessionState.tiktokScope.split(',')) : [];
        const projectData = {
            name: projectName, description: projectDescription || '',
            tiktokAccessToken: sessionState.tiktokAccessToken, tiktokUserID: sessionState.tiktokUserID,
            tiktokPermissions: permissionsArray,
        };
        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error in POST /api/tiktok/finalize-project:', error);
        res.status(500).json({ error: 'Failed to save TikTok project.' });
    }
});

app.get('/auth/tiktok', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'tiktok' };
    const tiktokScope = 'user.info.basic';
    const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${TIKTOK_CLIENT_KEY}&scope=${tiktokScope}&response_type=code&redirect_uri=${APP_BASE_URL}/auth/tiktok/callback&state=${state}`;
    res.redirect(tiktokAuthUrl);
});

app.get('/auth/tiktok/callback', async (req, res) => {
    const { code, state, error: tkError, error_description: tkErrorDescription } = req.query;
    const sessionState = req.session[state];
    if (tkError) {
        console.error(`TikTok auth callback error: ${tkError} - ${tkErrorDescription}`, req.query);
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+connecting+TikTok:+${encodeURIComponent(tkErrorDescription || 'Authentication_failed')}&status=error`);
    }
    if (!sessionState || !sessionState.initiated || sessionState.service !== 'tiktok') {
        console.error('TikTok auth callback error: Invalid state.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+TikTok:+Invalid+session+or+state&status=error');
    }
    if (!code) {
        console.error('TikTok auth callback error: No code provided.', req.query);
        delete req.session[state];
        return res.redirect('/?message=Error+connecting+TikTok:+Authentication+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.post(`https://open.tiktokapis.com/v2/oauth/token/`, new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET,
            code: code, grant_type: 'authorization_code', redirect_uri: `${APP_BASE_URL}/auth/tiktok/callback`
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const { access_token, refresh_token, open_id, scope, expires_in } = tokenResponse.data;
        if (!access_token || !open_id) {
            console.error('TikTok auth callback error: No access_token or open_id.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+TikTok:+Failed+to+obtain+access+token&status=error');
        }
        req.session[state].tiktokAccessToken = access_token;
        req.session[state].tiktokRefreshToken = refresh_token;
        req.session[state].tiktokUserID = open_id;
        req.session[state].tiktokScope = scope;
        req.session[state].tiktokExpiresIn = expires_in;
        res.redirect(`/finalize-project.html?state=${state}&service=tiktok`);
    } catch (error) {
        const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
        console.error('TikTok auth callback processing error:', errorMessage, error.response?.data || '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+TikTok:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

app.get('/auth/google/initiate', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).send('Project ID is required');
    req.session.gDriveProjectId = projectId;
    const scopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.profile'];
    const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
    res.redirect(authUrl);
});

app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;
    const projectId = req.session.gDriveProjectId;
    if (error) {
        console.error('Google Auth callback error:', error);
        delete req.session.gDriveProjectId;
        return res.redirect(`/?message=Error+connecting+Google+Drive:+${encodeURIComponent(error)}&status=error`);
    }
    if (!code) {
        delete req.session.gDriveProjectId;
        return res.redirect('/?message=Error+connecting+Google+Drive:+Code+missing&status=error');
    }
    if (!projectId) {
        console.error('Google Auth callback: Project ID missing from session.');
        return res.redirect('/?message=Error+connecting+Google+Drive:+Project+ID+session+error&status=error');
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            console.error(`Google Auth Callback: Project not found: ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Project+not+found&status=error`);
        }
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const parentFolderName = "marketing-agent";
        let parentFolderId;
        const folderQuery = `name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
        const { data: { files: existingFolders } } = await drive.files.list({ q: folderQuery, fields: 'files(id, name)' });
        if (existingFolders && existingFolders.length > 0) parentFolderId = existingFolders[0].id;
        else {
            const { data: newFolder } = await drive.files.create({ resource: { name: parentFolderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
            parentFolderId = newFolder.id;
        }
        if (!parentFolderId) throw new Error('Could not establish parent GDrive folder.');
        const { data: newProjectFolder } = await drive.files.create({ resource: { name: project.name, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }, fields: 'id' });
        const googleDriveFolderId = newProjectFolder.id;
        if (!googleDriveFolderId) throw new Error('Could not create project-specific GDrive folder.');
        const updateData = { googleDriveFolderId, googleDriveAccessToken: tokens.access_token };
        if (tokens.refresh_token) updateData.googleDriveRefreshToken = tokens.refresh_token;
        const updatedProject = await dataStore.updateProjectById(projectId, updateData);
        if (!updatedProject) throw new Error('Failed to save GDrive details to project.');
        delete req.session.gDriveProjectId;
        res.redirect(`/project-details.html?projectId=${projectId}&gdriveStatus=success`);
    } catch (err) {
        console.error(`Google Auth Callback Error for ${projectId}:`, err.response?.data || err.message, err.stack);
        delete req.session.gDriveProjectId;
        const errorMessage = err.response?.data?.error_description || err.response?.data?.error || 'Google auth processing failed.';
        return res.redirect(`/?message=Error+Google+Drive+setup:+${encodeURIComponent(errorMessage)}&status=error&projectId=${projectId}`);
    }
});

app.get('/api/facebook/pages', (req, res) => {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'State missing.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'facebook' || !sessionState.fbPages) {
        console.error('API /api/facebook/pages error: Invalid session or pages not found.', { queryState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session or Facebook pages missing.' });
    }
    res.json(sessionState.fbPages);
});

app.post('/api/facebook/finalize-project', async (req, res) => {
    const { state, selectedPageID, projectName, projectDescription } = req.body;
    if (!projectName) return res.status(400).json({ error: 'Project name required.' });
    if (!state || !selectedPageID) return res.status(400).json({ error: 'State or Page ID missing.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'facebook' || !sessionState.initiated || !sessionState.fbUserToken || !sessionState.facebookUserID || !sessionState.fbPages) {
        console.error('API /api/facebook/finalize-project error: Invalid session or FB data missing.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session or Facebook data missing.' });
    }
    const selectedPage = sessionState.fbPages.find(page => page.id === selectedPageID);
    if (!selectedPage) return res.status(404).json({ error: 'Selected Facebook Page not found in session.' });
    try {
        const projectData = {
            name: projectName, description: projectDescription || '',
            facebookUserAccessToken: sessionState.fbUserToken, facebookUserID: sessionState.facebookUserID,
            facebookSelectedPageID: selectedPageID, facebookPageName: selectedPage.name,
            facebookPageAccessToken: selectedPage.access_token, facebookPermissions: selectedPage.perms || []
        };
        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error in POST /api/facebook/finalize-project:', error);
        res.status(500).json({ error: 'Failed to save Facebook project.' });
    }
});

app.post('/api/projects', async (req, res) => {
    const { name, description, wordpressUrl, wordpressUsername, wordpressApplicationPassword } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required.' });
    try {
        const projectData = {
            name, description,
            wordpressUrl: wordpressUrl || null, wordpressUsername: wordpressUsername || null,
            wordpressApplicationPassword: wordpressApplicationPassword || null
        };
        const newProject = await dataStore.addProject(projectData);
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error creating project POST /api/projects:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to create project.' });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const projects = await dataStore.getAllProjects();
        res.status(200).json(projects);
    } catch (error) {
        console.error('Error getting projects:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to retrieve projects.' });
    }
});

app.get('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });
        res.status(200).json(project);
    } catch (error) {
        console.error(`Error getting project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve project.' });
    }
});

app.put('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const updateData = req.body;
    try {
        const updatedProject = await dataStore.updateProjectById(projectId, updateData);
        if (!updatedProject) return res.status(404).json({ error: 'Project not found for update.' });
        res.status(200).json(updatedProject);
    } catch (error) {
        console.error(`Error updating project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to update project.' });
    }
});

app.delete('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const success = await dataStore.deleteProjectById(projectId);
        if (!success) return res.status(404).json({ error: 'Project not found for deletion.' });
        res.status(200).json({ message: 'Project deleted.' });
    } catch (error) {
        console.error(`Error deleting project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to delete project.' });
    }
});

app.get('/api/projects/:projectId/assets', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });
        res.status(200).json(project.assets || []);
    } catch (error) {
        console.error(`Error listing assets for project ${projectId}:`, error);
        res.status(500).json({ error: 'Server error listing assets.' });
    }
});

app.post('/api/projects/:projectId/assets/upload', upload.single('assetFile'), async (req, res) => {
    const { projectId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });
        if (!project.googleDriveFolderId || !project.googleDriveAccessToken) {
            return res.status(400).json({ error: 'Google Drive not configured for this project.' });
        }
        const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        client.setCredentials({ access_token: project.googleDriveAccessToken, refresh_token: project.googleDriveRefreshToken });
        const drive = google.drive({ version: 'v3', auth: client });
        const uploadedFile = await drive.files.create({
            resource: { name: req.file.originalname, parents: [project.googleDriveFolderId] },
            media: { mimeType: req.file.mimetype, body: stream.Readable.from(req.file.buffer) },
            fields: 'id, name, mimeType'
        });
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const { vector, tags } = await vectorService.generateEmbedding(uploadedFile.data.name);
        const newAsset = {
            assetId, name: uploadedFile.data.name, type: uploadedFile.data.mimeType,
            googleDriveFileId: uploadedFile.data.id, vector, tags,
        };
        const updatedAssets = [...(project.assets || []), newAsset];
        await dataStore.updateProjectById(projectId, { assets: updatedAssets });
        vectorService.addAssetVector(projectId, newAsset.assetId, newAsset.vector);
        res.status(201).json(newAsset);
    } catch (error) {
        console.error(`Error uploading file for project ${projectId}:`, error.response?.data || error.message, error.stack);
        if (error.response?.data?.error) {
            const gError = error.response.data.error;
            if (gError.code === 401 || gError.errors?.some(e => e.reason === 'authError')) {
                 return res.status(401).json({ error: 'Google Drive auth error.', details: gError.message });
            }
            return res.status(500).json({ error: `Google Drive API error: ${gError.message}`, details: gError.errors });
        }
        res.status(500).json({ error: 'Server error uploading file.' });
    }
});

app.post('/api/projects/:projectId/objectives', async (req, res) => {
    const { projectId } = req.params;
    const { title, brief } = req.body;
    if (!title) return res.status(400).json({ error: 'Objective title required.' });
    const project = await dataStore.findProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    try {
        const savedObjective = await dataStore.addObjective({ title, brief }, project.id);
        if (!savedObjective) return res.status(500).json({ error: 'Failed to create objective.' });
        res.status(201).json(savedObjective);
    } catch (error) {
        console.error(`Error creating objective for project ${project.id}:`, error);
        res.status(500).json({ error: 'Failed to create objective.' });
    }
});

app.get('/api/projects/:projectId/objectives', async (req, res) => {
    const { projectId } = req.params;
    const project = await dataStore.findProjectById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    try {
        const objectives = await dataStore.getObjectivesByProjectId(projectId);
        res.status(200).json(objectives);
    } catch (error) {
        console.error(`Error getting objectives for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objectives.' });
    }
});

app.get('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective) return res.status(404).json({ error: 'Objective not found.' });
        res.status(200).json(objective);
    } catch (error) {
        console.error(`Error getting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objective.' });
    }
});

app.put('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    const { title, brief } = req.body;
    if (title === undefined && brief === undefined) return res.status(400).json({ error: 'Title or brief required.' });
    try {
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (brief !== undefined) updateData.brief = brief;
        const updatedObjective = await dataStore.updateObjectiveById(objectiveId, updateData);
        if (!updatedObjective) return res.status(404).json({ error: 'Objective not found for update.' });
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error updating objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to update objective.' });
    }
});

app.delete('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const success = await dataStore.deleteObjectiveById(objectiveId);
        if (!success) return res.status(404).json({ error: 'Objective not found for deletion.' });
        res.status(200).json({ message: 'Objective deleted.' });
    } catch (error) {
        console.error(`Error deleting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to delete objective.' });
    }
});

// This old chat endpoint should ideally be fully replaced by /api/agent (Next.js)
// For now, keeping it commented out or to be removed.
/*
app.post('/api/objectives/:objectiveId/chat', async (req, res) => {
    // ... old implementation ...
});
*/

// Serve Next.js app
// This needs to be configured if this Express server is serving a Next.js build in production.
// During development, `next dev` handles serving.
// For production, if self-hosting Next.js with this server:
// 1. Build Next.js app: `cd next_app && npm run build`
// 2. Point express.static to `next_app/.next/static` (or relevant build output)
// 3. Handle Next.js routing/SSR if not a static export. This can be complex.
// For now, this server is primarily for non-Next.js API routes.
// The catch-all below is for the OLD public/index.html, which is largely removed.

// Fallback for any other GET requests not handled by API routes or specific static files
// This will be hit less now that Next.js handles its own routing during dev.
app.get('*', (req, res) => {
  // This used to point to public/index.html.
  // If this server is NOT meant to serve the Next.js app's HTML in production,
  // this route might just return a 404 or a generic message.
  // If it IS, it needs to point to the Next.js output.
  // For now, let's assume Next.js dev server or a dedicated Next.js server handles client serving.
  res.status(404).send('Resource not found. API server is running. Client is served separately.');
});


app.listen(port, () => {
  console.log(`Main backend server listening at http://localhost:${port}`);
  console.log(`Starting scheduler to check for tasks every ${SCHEDULER_INTERVAL_MS / 1000} seconds.`);
  setInterval(() => {
    try {
      schedulerServiceInstance.checkScheduledTasks();
    } catch (error) {
      console.error("Error during scheduled task check:", error);
    }
  }, SCHEDULER_INTERVAL_MS);
});
