const express = require('express');
const path = require('path'); // Import the 'path' module
const agent = require('./agent');
const Project = require('./models/Project');
const Objective = require('./models/Objective');
const dataStore = require('./dataStore');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
// Assuming server.js is in src, and public is one level up from src
app.use(express.static(path.join(__dirname, '..', 'public')));

// === PROJECT API ENDPOINTS ===

// POST /api/projects - Create a new project
app.post('/api/projects', (req, res) => {
    const { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    try {
        const newProject = new Project(name, description);
        const savedProject = dataStore.addProject(newProject);
        res.status(201).json(savedProject);
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
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
        const agentResponse = await agent.getAgentResponse(userInput, objective.chatHistory);

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

    const agentResponse = await agent.getAgentResponse(userInput, history);
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
