// src/dataStore.js
const projects = [];
const objectives = [];

// --- Project Functions ---
function addProject(projectData) {
    // Assuming projectData contains name, description, and optionally the new fields
    const newProject = new (require('./models/Project'))(projectData.name, projectData.description);

    // Assign new fields if they are provided in projectData
    newProject.facebookUserAccessToken = projectData.facebookUserAccessToken || null;
    newProject.facebookUserID = projectData.facebookUserID || null;
    newProject.facebookSelectedPageID = projectData.facebookSelectedPageID || null;
    newProject.facebookPageName = projectData.facebookPageName || null; // Added
    newProject.facebookPageAccessToken = projectData.facebookPageAccessToken || null;
    newProject.facebookPermissions = projectData.facebookPermissions || [];
    newProject.tiktokAccessToken = projectData.tiktokAccessToken || null;
    newProject.tiktokUserID = projectData.tiktokUserID || null;
    newProject.tiktokPermissions = projectData.tiktokPermissions || [];

    // Assign LinkedIn fields
    newProject.linkedinAccessToken = projectData.linkedinAccessToken || null;
    newProject.linkedinUserID = projectData.linkedinUserID || null;
    newProject.linkedinUserFirstName = projectData.linkedinUserFirstName || null;
    newProject.linkedinUserLastName = projectData.linkedinUserLastName || null;
    newProject.linkedinUserEmail = projectData.linkedinUserEmail || null;
    newProject.linkedinPermissions = projectData.linkedinPermissions || [];

    // Assign Google Drive and asset-related fields
    newProject.googleDriveFolderId = projectData.googleDriveFolderId || null;
    newProject.googleDriveAccessToken = projectData.googleDriveAccessToken || null;
    newProject.googleDriveRefreshToken = projectData.googleDriveRefreshToken || null;
    newProject.assets = projectData.assets || [];

    projects.push(newProject);
    return newProject;
}

function getAllProjects() {
    return [...projects];
}

function findProjectById(projectId) {
    return projects.find(p => p.id === projectId);
}

function updateProjectById(projectId, updateData) {
    const project = findProjectById(projectId);
    if (project) {
        project.name = updateData.name !== undefined ? updateData.name : project.name;
        project.description = updateData.description !== undefined ? updateData.description : project.description;

        // Update Facebook fields if provided
        if (updateData.facebookUserAccessToken !== undefined) project.facebookUserAccessToken = updateData.facebookUserAccessToken;
        if (updateData.facebookUserID !== undefined) project.facebookUserID = updateData.facebookUserID;
        if (updateData.facebookSelectedPageID !== undefined) project.facebookSelectedPageID = updateData.facebookSelectedPageID;
        if (updateData.facebookPageName !== undefined) project.facebookPageName = updateData.facebookPageName; // Added
        if (updateData.facebookPageAccessToken !== undefined) project.facebookPageAccessToken = updateData.facebookPageAccessToken;
        if (updateData.facebookPermissions !== undefined) project.facebookPermissions = updateData.facebookPermissions;

        // Update TikTok fields if provided
        if (updateData.tiktokAccessToken !== undefined) project.tiktokAccessToken = updateData.tiktokAccessToken;
        if (updateData.tiktokUserID !== undefined) project.tiktokUserID = updateData.tiktokUserID;
        if (updateData.tiktokPermissions !== undefined) project.tiktokPermissions = updateData.tiktokPermissions;

        // Update LinkedIn fields if provided
        if (updateData.linkedinAccessToken !== undefined) project.linkedinAccessToken = updateData.linkedinAccessToken;
        if (updateData.linkedinUserID !== undefined) project.linkedinUserID = updateData.linkedinUserID;
        if (updateData.linkedinUserFirstName !== undefined) project.linkedinUserFirstName = updateData.linkedinUserFirstName;
        if (updateData.linkedinUserLastName !== undefined) project.linkedinUserLastName = updateData.linkedinUserLastName;
        if (updateData.linkedinUserEmail !== undefined) project.linkedinUserEmail = updateData.linkedinUserEmail;
        if (updateData.linkedinPermissions !== undefined) project.linkedinPermissions = updateData.linkedinPermissions;

        // Update Google Drive and asset-related fields if provided
        if (updateData.googleDriveFolderId !== undefined) project.googleDriveFolderId = updateData.googleDriveFolderId;
        if (updateData.googleDriveAccessToken !== undefined) project.googleDriveAccessToken = updateData.googleDriveAccessToken;
        if (updateData.googleDriveRefreshToken !== undefined) project.googleDriveRefreshToken = updateData.googleDriveRefreshToken;
        if (updateData.assets !== undefined) project.assets = updateData.assets;

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

function updateObjectiveById(objectiveId, title, brief, plan) {
    const objective = findObjectiveById(objectiveId);
    if (objective) {
        objective.title = title !== undefined ? title : objective.title;
        objective.brief = brief !== undefined ? brief : objective.brief;
        if (plan !== undefined) {
            objective.plan = plan;
        }
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
