const express = require('express');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const crypto = require('crypto');
const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');
const vectorService = require('./services/vectorService');
const { getAgentResponse, initializeAgent, agent } = require('./agent'); // Import the agent instance
const { generateProjectContextQuestions, structureProjectContextAnswers } = require('./services/geminiService');
const Project = require('./models/Project');
const Objective = require('./models/Objective');
const dataStore = require('./dataStore');
const SchedulerService = require('./services/schedulerService');
const app = express();
const port = process.env.PORT || 3000;

// --- CopilotKit Backend Imports ---
const { CopilotRuntime } = require('@copilotkit/backend');

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

// LinkedIn App Configuration
const config = require('./config/config');
const LINKEDIN_APP_ID = config.LINKEDIN_APP_ID || 'YOUR_LINKEDIN_APP_ID';
const LINKEDIN_APP_SECRET = config.LINKEDIN_APP_SECRET || 'YOUR_LINKEDIN_APP_SECRET';
const LINKEDIN_REDIRECT_URI = process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/auth/linkedin/callback` : `http://localhost:${port}/auth/linkedin/callback`;
const LINKEDIN_SCOPES = 'r_liteprofile r_emailaddress w_member_social';

const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${port}`;

// --- Google OAuth2 Client ---
const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
);

// --- Multer Configuration (for file uploads) ---
const upload = multer({ storage: multer.memoryStorage() });

// Middleware to parse JSON bodies
app.use(express.json());

// Session Middleware Setup
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_very_secret_key_for_session_dev',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// --- CopilotKit Agent API Endpoint ---
app.all('/api/agent', async (req, res) => {
    const { objectiveId } = req.body; // Or req.query, or req.headers - depends on how client sends it
    console.log('[CopilotKit Endpoint] Request received for /api/agent/');
    console.log('[CopilotKit Endpoint] Objective ID from request:', objectiveId); // Log to see if we get it

    // TODO: How to make the agent context specific to objectiveId?
    // The `agent` imported from agent.js is a singleton.
    // We need to either:
    // 1. Pass objectiveId to the agent's methods if they support it.
    // 2. Create/configure a new agent instance per request (less ideal for stateful agents but possible for stateless).
    // 3. Modify the agent to be able to dynamically load context based on objectiveId.

    // For now, let's assume the main `agent` can be used, and we'll need to adapt it.
    // A simple way to pass context might be through the forwardHeaders or by modifying the agent itself.

    // Placeholder: If objectiveId is present, log it. The actual use of objectiveId
    // to scope agent actions and memory will need deeper integration into `agent.js`
    // and how it's used by CopilotRuntime.
    if (objectiveId) {
        console.log(`[CopilotKit Endpoint] Context: Objective ID = ${objectiveId}`);
        // This is where you would typically fetch the objective's details,
        // chat history, plan, etc., and provide it to the agent instance
        // or to specific tools/actions used by the agent.
        // For example, if agent.js methods can accept an objective context:
        // agent.setObjectiveContext(await dataStore.findObjectiveById(objectiveId));
    }


    const copilotRuntime = new CopilotRuntime();
    try {
        // The `agent` from agent.js needs to be adapted to provide functions/tools
        // in the way CopilotRuntime expects. This is a placeholder.
        // The actual agent logic (getAgentResponse, initializeAgent) needs to be
        // refactored or wrapped to fit the CopilotKit execution model.
        // For a very basic start, we might just forward to a simple LangChain chain or similar
        // that's compatible with CopilotRuntime.

        // This is a highly simplified example. The real agent logic is more complex.
        // We need to make `agent.js` expose something that CopilotRuntime can use,
        // potentially by wrapping its core logic in functions that CopilotKit can call.
        // For now, a dummy action:
        const result = await copilotRuntime.run({
            // TODO: Replace with actual agent logic from agent.js
            // This might involve creating a Langchain compatible chain or agent executor
            // that uses the tools and LLM from our existing agent.js
            // For now, let's assume `agent` has a method like `processCopilotRequest`
            // or we define a simple function here.
             handler: async (payload) => {
                // Payload will contain messages, etc.
                // Here, you'd call your existing agent logic.
                // The `objectiveId` needs to be available here to pass to getAgentResponse.
                // This is a critical point for context.
                const currentObjectiveId = payload.copilotContext?.objectiveId || objectiveId || req.headers['x-objective-id'];
                if (!currentObjectiveId) {
                    return {
                        stream: null, // Or some error message
                        result: { type: "error", message: "Objective ID is missing. Cannot process request." }
                    };
                }

                const objective = await dataStore.findObjectiveById(currentObjectiveId);
                if (!objective) {
                     return { result: { type: "error", message: "Objective not found." } };
                }

                const lastUserMessage = payload.messages[payload.messages.length - 1];
                if (lastUserMessage.role !== 'user') {
                    return { result: { type: "error", message: "Last message not from user." } };
                }

                // This is where the main call to our existing agent logic would go.
                // We need to adapt getAgentResponse or the agent itself.
                // For now, let's simulate a simple text response.
                // const agentResponseText = await getAgentResponse(lastUserMessage.content, objective.chatHistory, currentObjectiveId);
                // await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'user', lastUserMessage.content);
                // await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'agent', agentResponseText);

                // CopilotRuntime expects a specific return structure, often involving a stream.
                // For simplicity, let's just return a text content for now.
                // The actual integration will involve making agent.js compatible with streaming and tool calls.
                // This will likely involve changes to how getAgentResponse works or wrapping it.
                // For a simple text streaming response:
                // return { stream: new ReadableStream({ start(controller) { controller.enqueue(JSON.stringify({ type: 'text', content: agentResponseText })); controller.close(); }}) };

                // --- Start: Actual Agent Logic Integration ---
                const agentResponsePayload = await getAgentResponse(lastUserMessage.content, objective.chatHistory, currentObjectiveId);

                let responseStream = new stream.Readable({ read() {} });

                if (typeof agentResponsePayload === 'string') { // Simple text response
                    await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'user', lastUserMessage.content);
                    await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'agent', agentResponsePayload);
                    responseStream.push(JSON.stringify({ type: "text", content: agentResponsePayload }) + "\n");
                } else if (typeof agentResponsePayload === 'object' && agentResponsePayload !== null) {
                    // This handles more complex responses, like plan updates or tool calls (though tool calls are not yet fully piped through CopilotKit here)
                    await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'user', lastUserMessage.content);

                    let messageToUser = agentResponsePayload.message || "Processing your request...";
                    if (agentResponsePayload.stepDescription) {
                        messageToUser = `${agentResponsePayload.stepDescription}\n\n${messageToUser}`;
                    }
                    await dataStore.addMessageToObjectiveChat(currentObjectiveId, 'agent', messageToUser);

                    responseStream.push(JSON.stringify({ type: "text", content: messageToUser }) + "\n");

                    // If plan was updated by the agent, persist it
                    if (agentResponsePayload.planStatus && objective.plan) {
                        const updatedPlan = {
                            ...objective.plan,
                            status: agentResponsePayload.planStatus,
                            currentStepIndex: agentResponsePayload.currentStep !== undefined ? agentResponsePayload.currentStep + 1 : objective.plan.currentStepIndex,
                        };
                        if(agentResponsePayload.planSteps) updatedPlan.steps = agentResponsePayload.planSteps;
                        await dataStore.updateObjectiveById(currentObjectiveId, { plan: updatedPlan });
                        // Optionally, send a separate message or UI update signal about the plan change
                        // For now, the text response includes plan step description.
                    }
                    // TODO: Handle actual tool calls and generative UI streaming from agentResponsePayload if it contains tool_call info.
                    // This requires agent.js to be refactored to work with CopilotKit's tool execution model.
                } else {
                    responseStream.push(JSON.stringify({ type: "error", message: "Received unexpected response type from agent." }) + "\n");
                }

                responseStream.push(null); // End of stream
                return { stream: responseStream };
                // --- End: Actual Agent Logic Integration ---
            },
            copilotContext: {
                objectiveId: objectiveId || req.body.objectiveId || req.headers['x-objective-id'],
            },
            req
        });
        res.setHeader('Content-Type', 'application/json');
        if (result.stream) {
            result.stream.pipe(res);
        } else if (result.result) { // Handle direct results if stream is not available (e.g. error before stream)
            res.status(result.result.type === "error" ? 500 : 200).json(result.result);
        } else {
            console.error('[CopilotKit Endpoint] No stream or result produced by CopilotRuntime.');
            res.status(500).json({ error: 'Internal server error: No response from CopilotRuntime.'});
        }

    } catch (error) {
        console.error('[CopilotKit Endpoint] Error in CopilotRuntime or handler:', error);
        res.status(500).json({ error: 'Error processing CopilotKit request' });
    }
});


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// === SOCIAL MEDIA AUTHENTICATION ROUTES ===
// ... (Existing social media auth routes remain unchanged) ...
// Step 1: Redirect user to LinkedIn for authentication
app.get('/auth/linkedin', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'linkedin' }; // Store state server-side

    const linkedinAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
        `&client_id=${LINKEDIN_APP_ID}` +
        `&redirect_uri=${LINKEDIN_REDIRECT_URI}` +
        `&state=${state}` +
        `&scope=${LINKEDIN_SCOPES}`;

    res.redirect(linkedinAuthUrl);
});

// Step 2: LinkedIn callback with authorization code
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
        // Exchange code for access token
        const tokenResponse = await axios.post(`https://www.linkedin.com/oauth/v2/accessToken`, new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: LINKEDIN_REDIRECT_URI,
            client_id: LINKEDIN_APP_ID,
            client_secret: LINKEDIN_APP_SECRET
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            console.error('LinkedIn auth callback error: No access token received from LinkedIn.', tokenResponse.data);
            delete req.session[state];
            return res.redirect('/?message=Error+connecting+LinkedIn:+Failed+to+obtain+access+token&status=error');
        }

        // Fetch basic profile information
        const profileResponse = await axios.get(`https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const linkedInUserId = profileResponse.data.id;
        const linkedInUserFirstName = profileResponse.data.localizedFirstName;
        const linkedInUserLastName = profileResponse.data.localizedLastName;

        // Fetch primary email address
        const emailResponse = await axios.get(`https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const linkedInUserEmail = emailResponse.data.elements[0]['handle~'].emailAddress;

        // Store token and user info in session
        req.session[state].linkedinAccessToken = accessToken;
        req.session[state].linkedinUserID = linkedInUserId;
        req.session[state].linkedinUserFirstName = linkedInUserFirstName;
        req.session[state].linkedinUserLastName = linkedInUserLastName;
        req.session[state].linkedinUserEmail = linkedInUserEmail;

        // Redirect to a frontend page for finalization
        res.redirect(`/finalize-project.html?state=${state}&service=linkedin`);

    } catch (error) {
        const errorMessage = error.response && error.response.data && error.response.data.error_description ?
                             error.response.data.error_description :
                             (error.response && error.response.data && error.response.data.error ? error.response.data.error : error.message);
        console.error('LinkedIn auth callback processing error:', errorMessage, error.response ? error.response.data : '');
        delete req.session[state];
        res.redirect(`/?message=Error+connecting+LinkedIn:+${encodeURIComponent(errorMessage)}&status=error`);
    }
});

// --- LinkedIn Project Finalization API ---
app.post('/api/linkedin/finalize-project', async (req, res) => {
    const { state, projectName, projectDescription } = req.body;

    if (!projectName) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!state) {
        return res.status(400).json({ error: 'Missing state field. Cannot finalize project.' });
    }

    const sessionState = req.session[state];
    if (!sessionState ||
        sessionState.service !== 'linkedin' ||
        !sessionState.initiated ||
        !sessionState.linkedinAccessToken ||
        !sessionState.linkedinUserID
    ) {
        console.error('API /api/linkedin/finalize-project error: Invalid session state or missing LinkedIn data.', { bodyState: state, sessionDataExists: !!sessionState });
        return res.status(400).json({ error: 'Invalid session state or required LinkedIn connection data not found. Please try reconnecting your LinkedIn account.' });
    }

    try {
        const permissionsArray = LINKEDIN_SCOPES ? LINKEDIN_SCOPES.split(' ') : [];

        const projectData = {
            name: projectName,
            description: projectDescription || '',
            linkedinAccessToken: sessionState.linkedinAccessToken,
            linkedinUserID: sessionState.linkedinUserID,
            linkedinUserFirstName: sessionState.linkedinUserFirstName,
            linkedinUserLastName: sessionState.linkedinUserLastName,
            linkedinUserEmail: sessionState.linkedinUserEmail,
            linkedinPermissions: permissionsArray,
        };

        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);

    } catch (error) {
        console.error('Error in POST /api/linkedin/finalize-project while saving project:', error);
        res.status(500).json({ error: 'Failed to save LinkedIn project data. Please try again.' });
    }
});

// --- Facebook Auth ---
app.get('/auth/facebook', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'facebook' };

    const facebookAuthUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}` +
        `&redirect_uri=${APP_BASE_URL}/auth/facebook/callback` +
        `&scope=public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts` +
        `&state=${state}` +
        `&response_type=code`;

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
        console.error('Facebook auth callback error: Invalid state or session expired.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+Facebook:+Invalid+session+or+state&status=error');
    }

    if (!code) {
        console.error('Facebook auth callback error: No code provided, but no error from Facebook.', req.query);
        delete req.session[state];
        return res.redirect('/?message=Error+connecting+Facebook:+Authentication+code+missing&status=error');
    }

    try {
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

        const pagesResponse = await axios.get(`https://graph.facebook.com/me/accounts`, {
            params: { access_token: userAccessToken }
        });

        const pagesData = pagesResponse.data.data;

        req.session[state].fbUserToken = userAccessToken;
        req.session[state].fbPages = pagesData;
        const userProfileResponse = await axios.get(`https://graph.facebook.com/me`, {
            params: { fields: 'id,name,email', access_token: userAccessToken }
        });
        req.session[state].facebookUserID = userProfileResponse.data.id;
        req.session[state].facebookUserEmail = userProfileResponse.data.email;

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
app.post('/api/projects/:projectId/context-questions', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const questions = await generateProjectContextQuestions(project.name, project.description);
        project.projectContextQuestions = questions;
        const updatedProjectResult = await dataStore.updateProjectById(projectId, { projectContextQuestions: questions });
        if (!updatedProjectResult) {
            console.error(`Failed to update project ${projectId} with context questions.`);
            return res.status(500).json({ error: 'Failed to save context questions to project.' });
        }
        res.status(200).json(questions);
    } catch (error) {
        console.error(`Error generating context questions for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to generate project context questions due to a server error.' });
    }
});

app.post('/api/projects/:projectId/context-answers', async (req, res) => {
    const { projectId } = req.params;
    const { userAnswersString } = req.body;

    if (!userAnswersString) {
        return res.status(400).json({ error: 'userAnswersString is required in the request body.' });
    }
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const structuredAnswers = await structureProjectContextAnswers(project.name, project.description, userAnswersString);
        project.projectContextAnswers = structuredAnswers;
        const updatedProjectResult = await dataStore.updateProjectById(projectId, { projectContextAnswers: structuredAnswers });
         if (!updatedProjectResult) {
            console.error(`Failed to update project ${projectId} with structured context answers.`);
            return res.status(500).json({ error: 'Failed to save structured context answers to project.' });
        }
        res.status(200).json({ message: 'Context answers submitted and structured successfully', projectContextAnswers: structuredAnswers });
    } catch (error) {
        console.error(`Error processing context answers for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to process project context answers due to a server error.' });
    }
});

app.delete('/api/projects/:projectId/assets/:assetId', async (req, res) => {
    const { projectId, assetId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        const assetIndex = project.assets ? project.assets.findIndex(a => a.assetId === assetId) : -1;
        if (assetIndex === -1) {
            return res.status(404).json({ error: 'Asset not found in project.' });
        }
        const assetToDelete = project.assets[assetIndex];
        const googleDriveFileId = assetToDelete.googleDriveFileId;

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
                console.error(`Failed to delete asset ${assetId} (Drive ID: ${googleDriveFileId}) from Google Drive:`,
                    driveError.response ? driveError.response.data : driveError.message);
                if (driveError.response && driveError.response.status === 404) {
                    console.warn(`Asset ${assetId} (Drive ID: ${googleDriveFileId}) not found on Google Drive. Proceeding with local deletion.`);
                }
            }
        } else if (googleDriveFileId) {
            console.warn(`Asset ${assetId} has a Google Drive File ID but project is missing GDrive token. Cannot delete from Drive.`);
        }
        vectorService.removeAssetVector(projectId, assetId);
        const updatedAssets = project.assets.filter(a => a.assetId !== assetId);
        await dataStore.updateProjectById(projectId, { assets: updatedAssets });
        res.status(200).json({ message: 'Asset deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting asset ${assetId} for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to delete asset due to a server error.' });
    }
});

app.post('/api/objectives/:objectiveId/plan/approve', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective) {
            return res.status(404).json({ error: 'Objective not found to approve plan for' });
        }
        if (!objective.plan) {
            return res.status(404).json({ error: 'Plan not found for this objective. Initialize it first.' });
        }
        objective.plan.status = 'approved';
        objective.updatedAt = new Date();
        const updatedObjective = await dataStore.updateObjectiveById(objective.id, { plan: objective.plan, updatedAt: objective.updatedAt });
        if (!updatedObjective) {
            console.error(`Failed to update objective ${objectiveId} after attempting to approve plan.`);
            return res.status(500).json({ error: 'Failed to save approved plan status.' });
        }
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error approving plan for objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to approve plan due to a server error.' });
    }
});

app.post('/api/objectives/:objectiveId/initialize-agent', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const updatedObjective = await initializeAgent(objectiveId);
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
app.post('/api/tiktok/finalize-project', async (req, res) => {
    const { state, projectName, projectDescription } = req.body;
    if (!projectName) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!state) {
        return res.status(400).json({ error: 'Missing state field. Cannot finalize project.' });
    }
    const sessionState = req.session[state];
    if (!sessionState ||
        sessionState.service !== 'tiktok' ||
        !sessionState.initiated ||
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
        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error in POST /api/tiktok/finalize-project while saving project:', error);
        res.status(500).json({ error: 'Failed to save project data. Please try again.' });
    }
});

// --- TikTok Auth ---
app.get('/auth/tiktok', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    req.session[state] = { initiated: true, service: 'tiktok' };
    const tiktokScope = 'user.info.basic';
    const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/` +
        `?client_key=${TIKTOK_CLIENT_KEY}` +
        `&scope=${tiktokScope}` +
        `&response_type=code` +
        `&redirect_uri=${APP_BASE_URL}/auth/tiktok/callback` +
        `&state=${state}`;
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
        console.error('TikTok auth callback error: Invalid state or session expired.', { queryState: state, sessionStateExists: !!sessionState });
        if (sessionState) delete req.session[state];
        return res.redirect('/?message=Error+connecting+TikTok:+Invalid+session+or+state&status=error');
    }
    if (!code) {
        console.error('TikTok auth callback error: No code provided, but no error from TikTok.', req.query);
        delete req.session[state];
        return res.redirect('/?message=Error+connecting+TikTok:+Authentication+code+missing&status=error');
    }
    try {
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
        req.session[state].tiktokAccessToken = access_token;
        req.session[state].tiktokRefreshToken = refresh_token;
        req.session[state].tiktokUserID = open_id;
        req.session[state].tiktokScope = scope;
        req.session[state].tiktokExpiresIn = expires_in;
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
app.get('/auth/google/initiate', (req, res) => {
    const { projectId } = req.query;
    if (!projectId) {
        return res.status(400).send('Project ID is required');
    }
    req.session.gDriveProjectId = projectId;
    const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
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
        return res.redirect('/?message=Error+connecting+Google+Drive:+Authorization+code+missing&status=error');
    }
    if (!projectId) {
        console.error('Google Auth callback: Project ID missing from session.');
        return res.redirect('/?message=Error+connecting+Google+Drive:+Project+ID+missing+from+session.+Please+try+again.&status=error');
    }
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            console.error(`Google Auth Callback: Project not found with ID: ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Project+not+found&status=error`);
        }
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const parentFolderName = "marketing-agent";
        let parentFolderId;
        const folderQuery = `name='${parentFolderName}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
        const { data: { files: existingFolders } } = await drive.files.list({ q: folderQuery, fields: 'files(id, name)' });
        if (existingFolders && existingFolders.length > 0) {
            parentFolderId = existingFolders[0].id;
        } else {
            const fileMetadata = { name: parentFolderName, mimeType: 'application/vnd.google-apps.folder' };
            const { data: newFolder } = await drive.files.create({ resource: fileMetadata, fields: 'id' });
            parentFolderId = newFolder.id;
        }
        if (!parentFolderId) {
            console.error(`Google Auth Callback: Failed to find or create parent folder '${parentFolderName}' for project ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Could+not+establish+parent+folder&status=error&projectId=${projectId}`);
        }
        const projectFolderName = project.name;
        const projectFolderMetadata = { name: projectFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] };
        const { data: newProjectFolder } = await drive.files.create({ resource: projectFolderMetadata, fields: 'id' });
        const googleDriveFolderId = newProjectFolder.id;
        if (!googleDriveFolderId) {
            console.error(`Google Auth Callback: Failed to create project-specific folder for project ${projectId}`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Could+not+create+project+folder&status=error&projectId=${projectId}`);
        }
        const updateData = { googleDriveFolderId: googleDriveFolderId, googleDriveAccessToken: tokens.access_token };
        if (tokens.refresh_token) {
            updateData.googleDriveRefreshToken = tokens.refresh_token;
        }
        const updatedProject = await dataStore.updateProjectById(projectId, updateData);
        if (!updatedProject) {
            console.error(`Google Auth Callback: Failed to update project ${projectId} in DataStore after GDrive setup.`);
            delete req.session.gDriveProjectId;
            return res.redirect(`/?message=Error+Google+Drive+setup:+Failed+to+save+Drive+details+to+project&status=error&projectId=${projectId}`);
        }
        delete req.session.gDriveProjectId;
        res.redirect(`/project-details.html?projectId=${projectId}&gdriveStatus=success`);
    } catch (err) {
        console.error(`Google Auth Callback Error for projectId ${projectId}:`, err.response ? err.response.data : err.message, err.stack);
        delete req.session.gDriveProjectId;
        const errorMessage = err.response && err.response.data && err.response.data.error_description
            ? err.response.data.error_description
            : (err.response && err.response.data && err.response.data.error ? err.response.data.error : 'Failed to process Google authentication.');
        return res.redirect(`/?message=Error+Google+Drive+setup:+${encodeURIComponent(errorMessage)}&status=error&projectId=${projectId}`);
    }
});

// --- Facebook Page Selection & Project Finalization API ---
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
    res.json(sessionState.fbPages);
});

app.post('/api/facebook/finalize-project', async (req, res) => {
    const { state, selectedPageID, projectName, projectDescription } = req.body;
    if (!projectName) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!state || !selectedPageID) {
        return res.status(400).json({ error: 'Missing required fields: state or selectedPageID.' });
    }
    const sessionState = req.session[state];
    if (!sessionState ||
        sessionState.service !== 'facebook' ||
        !sessionState.initiated ||
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
        const newProject = await dataStore.addProject(projectData);
        delete req.session[state];
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error in POST /api/facebook/finalize-project while saving project:', error);
        res.status(500).json({ error: 'Failed to save project data. Please try again.' });
    }
});

// === PROJECT API ENDPOINTS ===
app.post('/api/projects', async (req, res) => {
    const { name, description, wordpressUrl, wordpressUsername, wordpressApplicationPassword } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Project name is required.' });
    }
    try {
        const projectData = {
            name,
            description,
            wordpressUrl: wordpressUrl || null,
            wordpressUsername: wordpressUsername || null,
            wordpressApplicationPassword: wordpressApplicationPassword || null
        };
        const newProject = await dataStore.addProject(projectData);
        res.status(201).json(newProject);
    } catch (error) {
        console.error('Error creating project via POST /api/projects:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to create project. Please try again.' });
    }
});

app.get('/api/projects', async (req, res) => {
    try {
        const projects = await dataStore.getAllProjects();
        res.status(200).json(projects);
    } catch (error) {
        console.error('Error getting projects:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to retrieve projects' });
    }
});

app.get('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.status(200).json(project);
    } catch (error) {
        console.error(`Error getting project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve project' });
    }
});

app.put('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    // const { name, description, wordpressUrl, wordpressUsername, wordpressApplicationPassword } = req.body;
    const updateData = req.body; // Accept all fields from body for update

    // if (name === undefined && description === undefined) {
    //     return res.status(400).json({ error: 'At least name or description must be provided for update' });
    // }

    try {
        const updatedProject = await dataStore.updateProjectById(projectId, updateData);
        if (!updatedProject) {
            return res.status(404).json({ error: 'Project not found for update' });
        }
        res.status(200).json(updatedProject);
    } catch (error) {
        console.error(`Error updating project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

app.delete('/api/projects/:projectId', async (req, res) => {
    const { projectId } = req.params;
    try {
        const success = await dataStore.deleteProjectById(projectId);
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
app.get('/api/projects/:projectId/assets', async (req, res) => {
    const { projectId } = req.params;
    try {
        const project = await dataStore.findProjectById(projectId);
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

app.post('/api/projects/:projectId/assets/upload', upload.single('assetFile'), async (req, res) => {
    const { projectId } = req.params;
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }
    try {
        const project = await dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        if (!project.googleDriveFolderId || !project.googleDriveAccessToken) {
            return res.status(400).json({ error: 'Google Drive is not configured for this project. Please connect Google Drive first.' });
        }
        const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        client.setCredentials({
            access_token: project.googleDriveAccessToken,
            refresh_token: project.googleDriveRefreshToken,
        });
        const drive = google.drive({ version: 'v3', auth: client });
        const fileMetadata = { name: req.file.originalname, parents: [project.googleDriveFolderId] };
        const media = { mimeType: req.file.mimetype, body: stream.Readable.from(req.file.buffer) };
        const uploadedFile = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id, name, mimeType' });
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const assetNameForEmbedding = uploadedFile.data.name;
        const { vector, tags } = await vectorService.generateEmbedding(assetNameForEmbedding);
        const newAsset = {
            assetId,
            name: uploadedFile.data.name,
            type: uploadedFile.data.mimeType,
            googleDriveFileId: uploadedFile.data.id,
            vector: vector,
            tags: tags,
        };
        const updatedAssets = [...(project.assets || []), newAsset];
        await dataStore.updateProjectById(projectId, { assets: updatedAssets });
        vectorService.addAssetVector(projectId, newAsset.assetId, newAsset.vector);
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
app.post('/api/projects/:projectId/objectives', async (req, res) => {
    const { projectId } = req.params;
    const { title, brief } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Objective title is required' });
    }
    console.log(`[server.js POST objective] Received projectId from req.params: "${projectId}"`);
    const project = await dataStore.findProjectById(projectId);
    if (!project) {
        return res.status(404).json({ error: 'Project not found to add objective to' });
    }
    console.log(`[server.js POST objective] Initial project check passed for id: "${projectId}". Proceeding to call dataStore.addObjective.`);
    try {
        const objectiveData = { title, brief };
        const savedObjective = await dataStore.addObjective(objectiveData, project.id);
        if (!savedObjective) {
            console.error(`[server.js POST objective] dataStore.addObjective returned null for projectId: ${project.id}`);
            return res.status(500).json({ error: 'Failed to create objective due to an internal dataStore issue.' });
        }
        res.status(201).json(savedObjective);
    } catch (error) {
        console.error(`Error creating objective for project ${project.id}:`, error);
        res.status(500).json({ error: 'Failed to create objective' });
    }
});

app.get('/api/projects/:projectId/objectives', async (req, res) => {
    const { projectId } = req.params;
    console.log(`[SERVER LOG] Received request for objectives for projectId: ${projectId}`);
    const allProjects = await dataStore.getAllProjects();
    const currentProjectIds = allProjects.map(p => p.id);
    console.log(`[SERVER LOG] Project IDs currently in dataStore: ${JSON.stringify(currentProjectIds)}`);
    const project = await dataStore.findProjectById(projectId);
    if (!project) {
        console.log(`[SERVER LOG] Project with ID ${projectId} NOT FOUND in dataStore.`);
        return res.status(404).json({ error: 'Project not found' });
    }
    try {
        console.log(`[SERVER LOG] Project with ID ${projectId} found. Fetching objectives.`);
        const objectives = await dataStore.getObjectivesByProjectId(projectId);
        res.status(200).json(objectives);
    } catch (error) {
        console.error(`[SERVER LOG] Error getting objectives for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objectives' });
    }
});

app.get('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective) {
            return res.status(404).json({ error: 'Objective not found' });
        }
        res.status(200).json(objective);
    } catch (error) {
        console.error(`Error getting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve objective' });
    }
});

app.put('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    const { title, brief } = req.body;
    if (title === undefined && brief === undefined) {
        return res.status(400).json({ error: 'At least title or brief must be provided for update' });
    }
    try {
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (brief !== undefined) updateData.brief = brief;
        const updatedObjective = await dataStore.updateObjectiveById(objectiveId, updateData);
        if (!updatedObjective) {
            return res.status(404).json({ error: 'Objective not found for update' });
        }
        res.status(200).json(updatedObjective);
    } catch (error) {
        console.error(`Error updating objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to update objective' });
    }
});

app.delete('/api/objectives/:objectiveId', async (req, res) => {
    const { objectiveId } = req.params;
    try {
        const success = await dataStore.deleteObjectiveById(objectiveId);
        if (!success) {
            return res.status(404).json({ error: 'Objective not found for deletion' });
        }
        res.status(200).json({ message: 'Objective deleted successfully' });
    } catch (error) {
        console.error(`Error deleting objective ${objectiveId}:`, error);
        res.status(500).json({ error: 'Failed to delete objective' });
    }
});

// === OBJECTIVE CHAT API ENDPOINT (OLD - to be replaced by CopilotKit endpoint) ===
app.post('/api/objectives/:objectiveId/chat', async (req, res) => {
    const { objectiveId } = req.params;
    const { userInput } = req.body;

    if (!userInput) {
        return res.status(400).json({ error: 'userInput is required' });
    }
    try {
        const objective = await dataStore.findObjectiveById(objectiveId);
        if (!objective) {
            return res.status(404).json({ error: 'Objective not found' });
        }
        // This now directly uses the imported agent instance's methods
        const agentResponse = await agent.getAgentResponse(userInput, objective.chatHistory, objectiveId);
        await dataStore.addMessageToObjectiveChat(objectiveId, 'user', userInput);
        await dataStore.addMessageToObjectiveChat(objectiveId, 'agent', agentResponse.message || agentResponse);

        // If agentResponse contains plan updates, we need to persist them
        if (agentResponse.planStatus && objective.plan) {
            const updatedPlan = {
                ...objective.plan,
                status: agentResponse.planStatus,
                currentStepIndex: agentResponse.currentStep !== undefined ? agentResponse.currentStep + 1 : objective.plan.currentStepIndex,
            };
            if(agentResponse.planSteps) updatedPlan.steps = agentResponse.planSteps;
            await dataStore.updateObjectiveById(objectiveId, { plan: updatedPlan });
        }

        // Return the full agent response which might include plan status, etc.
        res.json(agentResponse);

    } catch (error) {
        console.error(`Error in objective chat for ${objectiveId}:`, error);
        if (error.message.startsWith('Agent:')) {
            res.status(500).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to get agent response for objective' });
        }
    }
});

app.get(/^\/(?!api).*/, (req, res) => {
  // If the client app is built to a 'dist' or 'build' folder inside 'client'
  const clientBuildPath = path.join(__dirname, '..', 'client', 'dist'); // For Vite
  // const clientBuildPath = path.join(__dirname, '..', 'client', 'build'); // For Create React App

  // Serve static assets from the client build directory
  app.use(express.static(clientBuildPath)); // This should ideally be earlier if it's serving all client assets

  // For any GET request not handled by API routes or static files, serve index.html
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});


app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log(`Starting scheduler to check for tasks every ${SCHEDULER_INTERVAL_MS / 1000} seconds.`);
  setInterval(() => {
    try {
      schedulerServiceInstance.checkScheduledTasks();
    } catch (error) {
      console.error("Error during scheduled task check:", error);
    }
  }, SCHEDULER_INTERVAL_MS);
});
