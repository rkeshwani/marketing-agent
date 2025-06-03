// src/dataStore.js
const projects = [];
const objectives = [];

// --- Project Functions ---
function addProject(project) {
    projects.push(project);
    return project;
}

function getAllProjects() {
    return [...projects];
}

function findProjectById(projectId) {
    return projects.find(p => p.id === projectId);
}

function updateProjectById(projectId, name, description) {
    const project = findProjectById(projectId);
    if (project) {
        project.name = name !== undefined ? name : project.name;
        project.description = description !== undefined ? description : project.description;
        project.updatedAt = new Date();
        return project;
    }
    return null;
}

function deleteProjectById(projectId) {
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        projects.splice(index, 1);
        // Also delete associated objectives
        const projectObjectives = objectives.filter(o => o.projectId === projectId);
        projectObjectives.forEach(o => deleteObjectiveById(o.id)); // Assumes deleteObjectiveById exists
        return true;
    }
    return false;
}

// --- Objective Functions ---
function addObjective(objective) {
    objectives.push(objective);
    return objective;
}

function getObjectivesByProjectId(projectId) {
    return objectives.filter(o => o.projectId === projectId);
}

function findObjectiveById(objectiveId) {
    return objectives.find(o => o.id === objectiveId);
}

function updateObjectiveById(objectiveId, title, brief) {
    const objective = findObjectiveById(objectiveId);
    if (objective) {
        objective.title = title !== undefined ? title : objective.title;
        objective.brief = brief !== undefined ? brief : objective.brief;
        objective.updatedAt = new Date();
        return objective;
    }
    return null;
}

function deleteObjectiveById(objectiveId) {
    const index = objectives.findIndex(o => o.id === objectiveId);
    if (index !== -1) {
        objectives.splice(index, 1);
        return true;
    }
    return false;
}

// Function to add a message to an objective's chat history
function addMessageToObjectiveChat(objectiveId, sender, text) {
    const objective = findObjectiveById(objectiveId);
    if (objective) {
        const message = {
            // In app.js, clientChatHistory uses { role: 'user', content: messageText }
            // Let's try to be consistent or adapt later as needed.
            // For now, using the structure from the original ChatHistory.js
            speaker: sender, // 'user' or 'agent'
            content: text, // message content
            timestamp: new Date()
        };
        objective.chatHistory.push(message);
        objective.updatedAt = new Date();
        return message;
    }
    return null;
}


module.exports = {
    addProject,
    getAllProjects,
    findProjectById,
    updateProjectById,
    deleteProjectById,
    addObjective,
    getObjectivesByProjectId,
    findObjectiveById,
    updateObjectiveById,
    deleteObjectiveById,
    addMessageToObjectiveChat
};
