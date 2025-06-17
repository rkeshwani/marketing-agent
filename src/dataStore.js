// src/dataStore.js
const fs = require('fs');
const path = require('path');
const Project = require('./models/Project');
const Objective = require('./models/Objective');

const DATA_FILE_PATH = path.join(__dirname, '..', 'data.json');

let projects = [];
let objectives = [];

// Function to load data from JSON file
function loadDataFromFile() {
  try {
    if (fs.existsSync(DATA_FILE_PATH)) {
      const jsonData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
      const data = JSON.parse(jsonData);

      const loadedProjects = (data.projects || []).map(p => {
        const project = new Project(p.name, p.description);
        // Assign all other properties from the loaded object to the instance
        // This ensures properties like id, createdAt, updatedAt, and any custom fields are restored.
        for (const key in p) {
          if (key !== 'name' && key !== 'description') { // Constructor handles these
            project[key] = p[key];
          }
        }
        // Ensure dates are Date objects if they are stored as strings
        if (p.createdAt) project.createdAt = new Date(p.createdAt);
        if (p.updatedAt) project.updatedAt = new Date(p.updatedAt);
        return project;
      });

      const loadedObjectives = (data.objectives || []).map(o => {
        // Corrected constructor arguments: projectId, title, brief
        const objective = new Objective(o.projectId, o.title, o.brief);
        // Assign all other properties, ensuring constructor-set ones are not overwritten from plain obj unless intended
        // and 'plan' is handled separately if it's meant to be fully replaced from JSON.
        for (const key in o) {
          if (!['projectId', 'title', 'brief', 'id', 'createdAt', 'updatedAt', 'chatHistory', 'plan'].includes(key)) {
            objective[key] = o[key];
          }
        }
        // Restore plan if it exists in the JSON object and if it's more than default
        if (o.plan) {
            objective.plan = { ...objective.plan, ...o.plan }; // Merge or overwrite as needed
        }
        // id, createdAt, updatedAt are set by constructor or should be directly assigned if overriding constructor
        if(o.id) objective.id = o.id; // allow JSON to override constructor ID if present
        if(o.createdAt) objective.createdAt = new Date(o.createdAt); // ensure Date object
        if(o.updatedAt) objective.updatedAt = new Date(o.updatedAt); // ensure Date object
        // Ensure dates are Date objects
        if (o.createdAt) objective.createdAt = new Date(o.createdAt);
        if (o.updatedAt) objective.updatedAt = new Date(o.updatedAt);
        // Reconstruct chatHistory messages if necessary, assuming they are plain objects
        if (o.chatHistory) {
            objective.chatHistory = o.chatHistory.map(message => ({
                ...message,
                timestamp: new Date(message.timestamp)
            }));
        }
        return objective;
      });

      projects = loadedProjects;
      objectives = loadedObjectives;
      console.log('Data loaded and instances reconstructed from', DATA_FILE_PATH);
    } else {
      console.log('No data file found. Initializing with empty data and creating file.');
      projects = [];
      objectives = [];
      saveDataToFile(); // Create data.json with empty arrays if it doesn't exist
    }
  } catch (error) {
    console.error('Error loading data from file:', error);
    projects = [];
    objectives = [];
  }
}

// Function to save data to JSON file
function saveDataToFile() {
  try {
    const data = { projects, objectives };
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log('Data saved to', DATA_FILE_PATH);
  } catch (error) {
    console.error('Error saving data to file:', error);
  }
}

// Load data on startup
loadDataFromFile();

// --- Project Functions ---
function addProject(projectData) {
    // Project class is already required at the top
    const newProject = new Project(projectData.name, projectData.description);

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
    console.log(`[dataStore.addProject] Added project "${newProject.name}" with id "${newProject.id}". Current project count: ${projects.length}. Project IDs: ${JSON.stringify(projects.map(p=>p.id))}`);
    saveDataToFile(); // Save after adding a new project
    return newProject;
}

function getAllProjects() {
    return [...projects];
}

function findProjectById(projectId) {
    console.log(`[dataStore.findProjectById] Searching for projectId: "${projectId}"`);
    if (!Array.isArray(projects)) {
        console.error('[dataStore.findProjectById] CRITICAL: projects variable is not an array! Value:', projects);
        return null; // Prevent TypeError from .find()
    }
    const project = projects.find(p => p.id === projectId);
    if (project) {
        console.log(`[dataStore.findProjectById] Found project with id: "${projectId}"`);
    } else {
        console.log(`[dataStore.findProjectById] Project NOT FOUND with id: "${projectId}". Current project IDs in store: ${JSON.stringify(projects.map(p=>p.id))}`);
    }
    return project;
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
        saveDataToFile(); // Save after updating a project
        return project;
    }
    return null;
}

function deleteProjectById(projectId) {
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        projects.splice(index, 1);
        // Also delete associated objectives
        // Note: deleteObjectiveById will call saveDataToFile, so multiple saves will occur.
        // This is acceptable for now, but could be optimized later if performance becomes an issue.
        const projectObjectives = objectives.filter(o => o.projectId === projectId);
        projectObjectives.forEach(o => deleteObjectiveById(o.id)); // This will trigger saves
        saveDataToFile(); // Save after deleting a project (and its objectives)
        return true;
    }
    return false;
}

// --- Objective Functions ---
function addObjective(objectiveData, projectId) {
    console.log(`[dataStore.addObjective] Attempting to add objective for projectId: "${projectId}"`);
    // Objective class is already required at the top
    const project = findProjectById(projectId); // This will now log details from findProjectById
    if (!project) {
        // Error already logged by findProjectById if not found, but can add context here if needed
        console.error(`[dataStore.addObjective] Prerequisite project check failed for projectId: "${projectId}". Objective not added.`);
        return null; // Or throw an error
    }
    // Corrected constructor arguments: projectId, title, brief
    const newObjective = new Objective(projectId, objectiveData.title, objectiveData.brief);

    // If plan structure is provided in objectiveData and needs to overwrite/extend default
    if (objectiveData.plan) {
        newObjective.plan = { ...newObjective.plan, ...objectiveData.plan };
    }
    // Note: id, createdAt, updatedAt are handled by the Objective constructor.
    // Any other specific properties from objectiveData should be assigned here if not covered by constructor.

    objectives.push(newObjective);
    saveDataToFile(); // Save after adding a new objective
    return newObjective;
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
        saveDataToFile(); // Save after updating an objective
        return objective;
    }
    return null;
}

function deleteObjectiveById(objectiveId) {
    const index = objectives.findIndex(o => o.id === objectiveId);
    if (index !== -1) {
        objectives.splice(index, 1);
        saveDataToFile(); // Save after deleting an objective
        return true;
    }
    return false;
}

// Function to add a message to an objective's chat history
// Note: Chat history saving is complex with current setup.
// We might need to call saveDataToFile() after this if chat history is critical to persist.
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
        saveDataToFile(); // Save after adding a message to chat history
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
    addMessageToObjectiveChat,
    saveDataToFile // Exporting for potential external use, though primarily internal
};
