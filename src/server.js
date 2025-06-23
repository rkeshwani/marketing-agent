```javascript
const express = require('express');
const http = require('http'); // Required for WebSocket server
const WebSocket = require('ws'); // WebSocket library
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');
const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');
const vectorService = require('./services/vectorService');
const agent = require('./agent'); // agent.js now exports an object
const { generateProjectContextQuestions, structureProjectContextAnswers } = require('./services/geminiService');
const Project = require('./models/Project');
const Objective = require('./models/Objective');
const dataStore = require('./dataStore');
const SchedulerService = require('./services/schedulerService');

const app = express();
const port = process.env.PORT || 3000;

// Create HTTP server from Express app
const server = http.createServer(app);

// Initialize WebSocket server and attach it to the HTTP server
const wss = new WebSocket.Server({ server });

// Map to store clients: objectiveId -> Set of WebSocket connections
const objectiveSockets = new Map();

// Helper function to send messages to clients for a specific objective
function sendWebSocketMessageToObjective(objectiveId, messageObject) {
    const clients = objectiveSockets.get(objectiveId);
    if (clients) {
        const messageString = JSON.stringify(messageObject);
        console.log(`Sending WebSocket message to objective ${objectiveId} subscribers:`, messageObject.type, messageObject.payload);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(messageString);
                } catch (e) {
                    console.error(`Error sending WebSocket message to client ${client.id}:`, e);
                }
            }
        });
    } else {
        // console.log(`No active WebSocket clients for objective ${objectiveId} to send message of type:`, messageObject.type);
    }
}

wss.on('connection', (ws) => {
    const wsId = crypto.randomBytes(8).toString('hex');
    ws.id = wsId; // Assign a unique ID to the WebSocket connection
    console.log(`WebSocket client ${ws.id} connected.`);

    ws.on('message', async (messageString) => {
        console.log(`Received WebSocket message from ${ws.id}: ${messageString}`);
        let message;
        try {
            message = JSON.parse(messageString);
        } catch (e) {
            console.error(`Failed to parse WebSocket message from ${ws.id}: ${messageString}`, e);
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON message format.' } }));
            return;
        }

        const { type, payload, objectiveId: msgObjectiveId } = message;

        // Allow client_hello to establish association without prior objectiveId on ws
        if (type === 'client_hello' && msgObjectiveId) {
            if (ws.objectiveId && ws.objectiveId !== msgObjectiveId && objectiveSockets.has(ws.objectiveId)) {
                objectiveSockets.get(ws.objectiveId).delete(ws);
                 if (objectiveSockets.get(ws.objectiveId)?.size === 0) {
                    objectiveSockets.delete(ws.objectiveId);
                }
            }
            ws.objectiveId = msgObjectiveId;
            if (!objectiveSockets.has(msgObjectiveId)) {
                objectiveSockets.set(msgObjectiveId, new Set());
            }
            objectiveSockets.get(msgObjectiveId).add(ws);
            console.log(`WebSocket client ${ws.id} associated with objective ${msgObjectiveId}`);
            ws.send(JSON.stringify({ type: 'hello_ack', payload: { message: `Associated with objective ${msgObjectiveId}.` }}));
            return;
        }

        const currentObjectiveId = ws.objectiveId || msgObjectiveId;

        if (!currentObjectiveId) {
            console.warn(`WebSocket message from ${ws.id} without objectiveId. Type: ${type}`);
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'ObjectiveId must be provided or connection pre-associated.' } }));
            return;
        }

        // Ensure association for subsequent messages if not done by client_hello
        if (!ws.objectiveId) {
            ws.objectiveId = currentObjectiveId;
            if (!objectiveSockets.has(currentObjectiveId)) {
                objectiveSockets.set(currentObjectiveId, new Set());
            }
            objectiveSockets.get(currentObjectiveId).add(ws);
            console.log(`WebSocket client ${ws.id} dynamically associated with objective ${currentObjectiveId} on message type ${type}`);
        }


        try {
            let agentResult;
            let objective;
            let nextStepResult;
            let updatedObjective;

            switch (type) {
                case 'tool_approval_response':
                    agentResult = await agent.handleToolApprovalResponse(currentObjectiveId, payload);
                    if (agentResult.webSocketMessages) {
                        agentResult.webSocketMessages.forEach(wsMsg => sendWebSocketMessageToObjective(currentObjectiveId, wsMsg));
                    }
                    objective = dataStore.findObjectiveById(currentObjectiveId); // Re-fetch
                    if (objective) {
                        objective.currentAgentState = agentResult.nextAgentState;
                        dataStore.updateObjectiveById(currentObjectiveId, objective);
                    }

                    if (agentResult.nextAgentState === 'processing') {
                        objective = dataStore.findObjectiveById(currentObjectiveId); // Re-fetch latest state
                        if (objective && objective.plan && (objective.plan.status === 'in_progress' || objective.plan.status === 'approved') && objective.plan.currentStepIndex < objective.plan.steps.length) {
                            console.log(`Server: Proactively continuing plan for objective ${currentObjectiveId} after tool response.`);
                            nextStepResult = await agent.getAgentResponse('_SYSTEM_CONTINUE_AFTER_TOOL_', currentObjectiveId);
                            if (nextStepResult.webSocketMessages) {
                                nextStepResult.webSocketMessages.forEach(wsMsg => sendWebSocketMessageToObjective(currentObjectiveId, wsMsg));
                            }
                            updatedObjective = dataStore.findObjectiveById(currentObjectiveId);
                            if(updatedObjective) {
                               updatedObjective.currentAgentState = nextStepResult.nextAgentState;
                               dataStore.updateObjectiveById(currentObjectiveId, updatedObjective);
                            }
                        }
                    }
                    break;
                case 'budget_input_response':
                    agentResult = await agent.handleBudgetInquiryResponse(currentObjectiveId, payload.budget);
                    if (agentResult.webSocketMessages) {
                        agentResult.webSocketMessages.forEach(wsMsg => sendWebSocketMessageToObjective(currentObjectiveId, wsMsg));
                    }
                    objective = dataStore.findObjectiveById(currentObjectiveId); // Re-fetch
                     if (objective) {
                        objective.currentAgentState = agentResult.nextAgentState;
                        dataStore.updateObjectiveById(currentObjectiveId, objective);
                    }

                    if (agentResult.nextAgentState === 'processing') {
                        objective = dataStore.findObjectiveById(currentObjectiveId); // Re-fetch latest state
                        if (objective && objective.plan && (objective.plan.status === 'in_progress' || objective.plan.status === 'approved') && objective.plan.currentStepIndex < objective.plan.steps.length) {
                            console.log(`Server: Proactively continuing plan for objective ${currentObjectiveId} after budget response.`);
                            nextStepResult = await agent.getAgentResponse('_SYSTEM_CONTINUE_AFTER_BUDGET_', currentObjectiveId);
                            if (nextStepResult.webSocketMessages) {
                                nextStepResult.webSocketMessages.forEach(wsMsg => sendWebSocketMessageToObjective(currentObjectiveId, wsMsg));
                            }
                            updatedObjective = dataStore.findObjectiveById(currentObjectiveId);
                            if(updatedObjective) {
                               updatedObjective.currentAgentState = nextStepResult.nextAgentState;
                               dataStore.updateObjectiveById(currentObjectiveId, updatedObjective);
                            }
                        }
                    }
                    break;
                default:
                    console.log(`Unknown WebSocket message type received: ${type} from ${ws.id}`);
                    ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown message type: ${type}` } }));
            }
        } catch (e) {
            console.error(`Error processing WebSocket message type ${type} for objective ${currentObjectiveId}:`, e);
            sendWebSocketMessageToObjective(currentObjectiveId, { type: 'error', payload: { message: `Server error processing your request: ${e.message}` } });
        }
    });

    ws.on('close', () => {
        console.log(`WebSocket client ${ws.id} disconnected.`);
        if (ws.objectiveId && objectiveSockets.has(ws.objectiveId)) {
            objectiveSockets.get(ws.objectiveId).delete(ws);
            if (objectiveSockets.get(ws.objectiveId).size === 0) {
                objectiveSockets.delete(ws.objectiveId);
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id}:`, error);
         if (ws.objectiveId && objectiveSockets.has(ws.objectiveId)) {
            objectiveSockets.get(ws.objectiveId).delete(ws);
            if (objectiveSockets.get(ws.objectiveId).size === 0) {
                objectiveSockets.delete(ws.objectiveId);
            }
        }
    });
});


// --- Initialize Scheduler ---
const schedulerServiceInstance = new SchedulerService(dataStore);
const SCHEDULER_INTERVAL_MS = 60 * 1000; // Check every minute

// --- OAuth & App Configuration ---
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
app.use(express.static(path.join(__dirname, '..', 'public')));

// === SOCIAL MEDIA AUTHENTICATION ROUTES ===
// --- LinkedIn Auth ---
app.get('/auth/linkedin', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'linkedin' };
    const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${LINKEDIN_APP_ID}&redirect_uri=${LINKEDIN_REDIRECT_URI}&state=${state}&scope=${LINKEDIN_SCOPES}`;
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
    if (!sessionState || !sessionState.initiated || sessionState.service !== 'linkedin' || !code) {
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+LinkedIn:+Invalid+session+or+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.post(`https://www.linkedin.com/oauth/v2/accessToken`, new URLSearchParams({
            grant_type: 'authorization_code', code, redirect_uri: LINKEDIN_REDIRECT_URI,
            client_id: LINKEDIN_APP_ID, client_secret: LINKEDIN_APP_SECRET
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error('Failed to obtain access token');
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

app.post('/api/linkedin/finalize-project', (req, res) => {
    const { state, projectName, projectDescription } = req.body;
    if (!projectName || !state) return res.status(400).json({ error: 'Project name and state are required.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'linkedin' || !sessionState.linkedinAccessToken || !sessionState.linkedinUserID) {
        return res.status(400).json({ error: 'Invalid session or LinkedIn data missing.' });
    }
    try {
        const permissionsArray = LINKEDIN_SCOPES ? LINKEDIN_SCOPES.split(' ') : [];
        const projectData = {
            name: projectName, description: projectDescription || '',
            linkedinAccessToken: sessionState.linkedinAccessToken, linkedinUserID: sessionState.linkedinUserID,
            linkedinUserFirstName: sessionState.linkedinUserFirstName, linkedinUserLastName: sessionState.linkedinUserLastName,
            linkedinUserEmail: sessionState.linkedinUserEmail, linkedinPermissions: permissionsArray,
        };
        const newProject = dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save LinkedIn project.' });
    }
});

// --- Facebook Auth ---
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
    const { code, state, error: fbError, error_description: fbErrorDescription } = req.query;
    const sessionState = req.session[state];
    if (fbError) {
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+Facebook:+${encodeURIComponent(fbErrorDescription || 'Auth_failed')}&status=error`);
    }
    if (!sessionState || sessionState.service !== 'facebook' || !code) {
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+Facebook:+Invalid+session+or+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
            params: { client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET, redirect_uri: `${APP_BASE_URL}/auth/facebook/callback`, code }
        });
        const userAccessToken = tokenResponse.data.access_token;
        if (!userAccessToken) {
            delete req.session[state];
            return res.redirect('/?message=Error+Facebook:+Failed+to+get+token&status=error');
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
        delete req.session[state];
        res.redirect(`/?message=Error+Facebook:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

// --- TikTok Auth ---
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
        if (sessionState) delete req.session[state];
        return res.redirect(`/?message=Error+TikTok:+${encodeURIComponent(tkErrorDescription || 'Auth_failed')}&status=error`);
    }
    if (!sessionState || sessionState.service !== 'tiktok' || !code) {
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+TikTok:+Invalid+session+or+code+missing&status=error');
    }
    try {
        const tokenResponse = await axios.post(`https://open.tiktokapis.com/v2/oauth/token/`, new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY, client_secret: TIKTOK_CLIENT_SECRET, code,
            grant_type: 'authorization_code', redirect_uri: `${APP_BASE_URL}/auth/tiktok/callback`
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const { access_token, refresh_token, open_id, scope, expires_in } = tokenResponse.data;
        if (!access_token || !open_id) {
            delete req.session[state];
            return res.redirect('/?message=Error+TikTok:+Failed+to+get+token&status=error');
        }
        req.session[state].tiktokAccessToken = access_token; req.session[state].tiktokRefreshToken = refresh_token;
        req.session[state].tiktokUserID = open_id; req.session[state].tiktokScope = scope;
        req.session[state].tiktokExpiresIn = expires_in;
        res.redirect(`/finalize-project.html?state=${state}&service=tiktok`);
    } catch (error) {
        const errorMessage = error.response?.data?.error_description || error.response?.data?.error || error.message;
        delete req.session[state];
        res.redirect(`/?message=Error+TikTok:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

// --- Google Drive Auth ---
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
    if (error || !code || !projectId) {
        delete req.session.gDriveProjectId;
        return res.redirect(`/?message=Error+Google+Drive:+${encodeURIComponent(error || 'Code/ProjectID missing')}&status=error`);
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Project+not+found&status=error`);
        }
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const parentFolderName = "marketing-agent";
        let parentFolderId;
        const { data: { files: existingFolders } } = await drive.files.list({ q: `name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`, fields: 'files(id, name)' });
        if (existingFolders && existingFolders.length > 0) {
            parentFolderId = existingFolders[0].id;
        } else {
            const { data: newFolder } = await drive.files.create({ resource: { name: parentFolderName, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' });
            parentFolderId = newFolder.id;
        }
        if (!parentFolderId) throw new Error("Could not establish parent folder");
        const { data: newProjectFolder } = await drive.files.create({ resource: { name: project.name, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] }, fields: 'id' });
        const googleDriveFolderId = newProjectFolder.id;
        if (!googleDriveFolderId) throw new Error("Could not create project folder");
        const updateData = { googleDriveFolderId, googleDriveAccessToken: tokens.access_token };
        if (tokens.refresh_token) updateData.googleDriveRefreshToken = tokens.refresh_token;
        dataStore.updateProjectById(projectId, updateData);
        delete req.session.gDriveProjectId;
        res.redirect(`/project-details.html?projectId=${projectId}&gdriveStatus=success`);
    } catch (err) {
        delete req.session.gDriveProjectId;
        const errorMessage = err.response?.data?.error_description || err.response?.data?.error || err.message;
        res.redirect(`/?message=Error+Google+Drive+setup:+${encodeURIComponent(errorMessage)}&status=error&projectId=${projectId}`);
    }
});


// --- Facebook Page Selection & Project Finalization API ---
app.get('/api/facebook/pages', (req, res) => {
    const { state } = req.query;
    if (!state) return res.status(400).json({ error: 'State parameter is missing.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'facebook' || !sessionState.fbPages) {
        return res.status(400).json({ error: 'Invalid session state or Facebook pages not found.' });
    }
    res.json(sessionState.fbPages);
});

app.post('/api/facebook/finalize-project', (req, res) => {
    const { state, selectedPageID, projectName, projectDescription } = req.body;
    if (!projectName || !state || !selectedPageID) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'facebook' || !sessionState.fbUserToken || !sessionState.facebookUserID || !sessionState.fbPages) {
        return res.status(400).json({ error: 'Invalid session or Facebook data missing.' });
    }
    const selectedPage = sessionState.fbPages.find(page => page.id === selectedPageID);
    if (!selectedPage) return res.status(404).json({ error: 'Selected Facebook Page not found.' });
    try {
        const projectData = {
            name: projectName, description: projectDescription || '',
            facebookUserAccessToken: sessionState.fbUserToken, facebookUserID: sessionState.facebookUserID,
            facebookSelectedPageID: selectedPageID, facebookPageName: selectedPage.name,
            facebookPageAccessToken: selectedPage.access_token, facebookPermissions: selectedPage.perms || []
        };
        const newProject = dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save project data.' });
    }
});

app.post('/api/tiktok/finalize-project', (req, res) => {
    const { state, projectName, projectDescription } = req.body;
    if (!projectName || !state) return res.status(400).json({ error: 'Project name and state are required.' });
    const sessionState = req.session[state];
    if (!sessionState || sessionState.service !== 'tiktok' || !sessionState.tiktokAccessToken || !sessionState.tiktokUserID) {
        return res.status(400).json({ error: 'Invalid session or TikTok data missing.' });
    }
    try {
        const permissionsArray = sessionState.tiktokScope ? (Array.isArray(sessionState.tiktokScope) ? sessionState.tiktokScope : sessionState.tiktokScope.split(',')) : [];
        const projectData = {
            name: projectName, description: projectDescription || '',
            tiktokAccessToken: sessionState.tiktokAccessToken, tiktokUserID: sessionState.tiktokUserID,
            tiktokPermissions: permissionsArray,
        };
        const newProject = dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save TikTok project data.' });
    }
});


// --- PROJECT CONTEXT API ENDPOINTS ---
app.post('/api/projects/:projectId/context-questions', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const questions = await generateProjectContextQuestions(project.name, project.description);
        project.projectContextQuestions = questions;
        dataStore.updateProjectById(projectId, { projectContextQuestions: questions });
        res.status(200).json(questions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate project context questions.' });
    }
});

app.post('/api/projects/:projectId/context-answers', async (req, res) => {
    const { projectId } = req.params;
    const { userAnswersString } = req.body;
    if (!userAnswersString) return res.status(400).json({ error: 'userAnswersString is required.' });
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        const structuredAnswers = await structureProjectContextAnswers(project.name, project.description, userAnswersString);
        project.projectContextAnswers = structuredAnswers;
        dataStore.updateProjectById(projectId, { projectContextAnswers: structuredAnswers });
        res.status(200).json({ message: 'Context answers submitted successfully', projectContextAnswers: structuredAnswers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to process project context answers.' });
    }
});

// DELETE /api/projects/:projectId/assets/:assetId - Delete an asset
app.delete('/api/projects/:projectId/assets/:assetId', async (req, res) => {
    const { projectId, assetId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });
        const assetIndex = project.assets ? project.assets.findIndex(a => a.assetId === assetId) : -1;
        if (assetIndex === -1) return res.status(404).json({ error: 'Asset not found.' });
        const assetToDelete = project.assets[assetIndex];
        if (assetToDelete.googleDriveFileId && project.googleDriveAccessToken) {
            const driveClient = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
            driveClient.setCredentials({ access_token: project.googleDriveAccessToken, refresh_token: project.googleDriveRefreshToken });
            const drive = google.drive({ version: 'v3', auth: driveClient });
            try {
                await drive.files.delete({ fileId: assetToDelete.googleDriveFileId });
            } catch (driveError) {
                console.error(`Failed to delete GDrive asset ${assetToDelete.googleDriveFileId}:`, driveError.message);
                if (driveError.response && driveError.response.status !== 404) {
                     // Optionally, don't proceed with local deletion if GDrive fails for reasons other than not found
                }
            }
        }
        vectorService.removeAssetVector(projectId, assetId);
        const updatedAssets = project.assets.filter(a => a.assetId !== assetId);
        dataStore.updateProjectById(projectId, { assets: updatedAssets });
        res.status(200).json({ message: 'Asset deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete asset.' });
    }
});


// POST /api/objectives/:objectiveId/initialize-agent - Initialize agent and generate plan
app.post('/api/objectives/:objectiveId/initialize-agent', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const updatedObjective = await agent.initializeAgent(objectiveId);
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Server: Error initializing agent for objective ${objectiveId}:`, error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to initialize agent for objective' });
        }
    }
});

// --- TikTok Project Finalization API ---
app.post('/api/tiktok/finalize-project', (req, res) => {
>>>>>>> REPLACE
