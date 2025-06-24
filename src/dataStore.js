// src/dataStore.js
const FlatFileStore = require('./providers/FlatFileStore');
const path = require('path');

// Determine the path to data.json relative to the src directory
// __dirname is src, so ../data.json
const DATA_FILE_PATH = path.join(__dirname, '..', 'data.json');

// Instantiate the provider
// For now, we are hardcoding FlatFileStore.
// In the future, this could be determined by a config.
const store = new FlatFileStore(DATA_FILE_PATH);

// Initialize and load data
// This is an async operation, but for module initialization,
// we'll call it and let it run. Subsequent calls will operate on loaded data.
// For a server environment, you might want to ensure this completes before accepting requests.
store.loadData().catch(error => {
    console.error("Failed to initialize data store:", error);
    // Depending on the application, you might want to exit or enter a degraded state.
});

// --- Delegated Functions ---
// All functions now become async as they interact with an async store.

async function addProject(projectData) {
    return store.addProject(projectData);
}

async function getAllProjects() {
    return store.getAllProjects();
}

async function findProjectById(projectId) {
    return store.findProjectById(projectId);
}

async function updateProjectById(projectId, updateData) {
    return store.updateProjectById(projectId, updateData);
}

async function deleteProjectById(projectId) {
    return store.deleteProjectById(projectId);
}

async function addObjective(objectiveData, projectId) {
    return store.addObjective(objectiveData, projectId);
}

async function getObjectivesByProjectId(projectId) {
    return store.getObjectivesByProjectId(projectId);
}

async function getAllObjectives() {
    return store.getAllObjectives();
}

async function findObjectiveById(objectiveId) {
    return store.findObjectiveById(objectiveId);
}

async function updateObjectiveById(objectiveId, objectiveData) {
    return store.updateObjectiveById(objectiveId, objectiveData);
}

async function deleteObjectiveById(objectiveId) {
    return store.deleteObjectiveById(objectiveId);
}

async function addMessageToObjectiveChat(objectiveId, sender, text) {
    return store.addMessageToObjectiveChat(objectiveId, sender, text);
}

// Expose a way to save data if needed externally, though FlatFileStore handles its own saves.
async function saveData() {
    return store.saveData();
}

module.exports = {
    addProject,
    getAllProjects,
    findProjectById,
    updateProjectById,
    deleteProjectById,
    addObjective,
    getObjectivesByProjectId,
    getAllObjectives,
    findObjectiveById,
    updateObjectiveById,
    deleteObjectiveById,
    addMessageToObjectiveChat,
    saveData // Exporting the saveData method from the store instance
};
