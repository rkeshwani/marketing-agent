// src/dataStore.js
const path = require('path');
const FlatFileStore = require('./providers/FlatFileStore');
const MongoDbStore = require('./providers/MongoDbStore');
const FirestoreStore = require('./providers/FirestoreStore');
const DynamoDbStore = require('./providers/DynamoDbStore');
const CosmosDbStore = require('./providers/CosmosDbStore'); // Added CosmosDB provider

// --- Configuration ---
const DATA_PROVIDER = process.env.DATA_PROVIDER || 'flatfile'; // Default to flatfile

// MongoDB Config
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'agentic_chat_js_db';

// FlatFile Config
const DATA_FILE_PATH = path.join(__dirname, '..', 'data.json');

// Firestore Config
const GCLOUD_PROJECT_ID = process.env.GCLOUD_PROJECT_ID;
const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// DynamoDB Config
const AWS_REGION = process.env.AWS_REGION; // e.g., 'us-east-1'
const DYNAMODB_PROJECTS_TABLE = process.env.DYNAMODB_PROJECTS_TABLE || 'agentic-chat-projects';
const DYNAMODB_OBJECTIVES_TABLE = process.env.DYNAMODB_OBJECTIVES_TABLE || 'agentic-chat-objectives';

// Cosmos DB Config
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT; // e.g., https://your-account.documents.azure.com:443/
const COSMOS_KEY = process.env.COSMOS_KEY; // Primary key
const COSMOS_DATABASE_ID = process.env.COSMOS_DATABASE_ID || 'agenticChatDB';
const COSMOS_PROJECTS_CONTAINER_ID = process.env.COSMOS_PROJECTS_CONTAINER_ID || 'Projects';
const COSMOS_OBJECTIVES_CONTAINER_ID = process.env.COSMOS_OBJECTIVES_CONTAINER_ID || 'Objectives';

let store;

// --- Instantiate Provider based on Configuration ---
switch (DATA_PROVIDER.toLowerCase()) {
    case 'mongodb':
        console.log(`Initializing MongoDB data store with URI: ${MONGODB_URI} and DB: ${MONGODB_DB_NAME}`);
        store = new MongoDbStore(MONGODB_URI, MONGODB_DB_NAME);
        break;
    case 'firestore':
        if (!GCLOUD_PROJECT_ID && !GOOGLE_APPLICATION_CREDENTIALS) {
            console.warn('Firestore provider selected, but GCLOUD_PROJECT_ID or GOOGLE_APPLICATION_CREDENTIALS are not set. Client may rely on ADC discovery if running in GCP.');
        }
        console.log(`Initializing Firestore data store for project ID: ${GCLOUD_PROJECT_ID || 'default (ADC)'}. KeyFile: ${GOOGLE_APPLICATION_CREDENTIALS || 'ADC'}`);
        store = new FirestoreStore(GCLOUD_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS);
        break;
    case 'dynamodb':
        if (!AWS_REGION) {
            console.warn('DynamoDB provider selected, but AWS_REGION is not set. SDK might try to infer it or use default, which could lead to issues.');
        }
        console.log(`Initializing DynamoDB data store in region: ${AWS_REGION || 'default SDK region'}. Tables: ${DYNAMODB_PROJECTS_TABLE}, ${DYNAMODB_OBJECTIVES_TABLE}`);
        store = new DynamoDbStore(AWS_REGION, DYNAMODB_PROJECTS_TABLE, DYNAMODB_OBJECTIVES_TABLE);
        break;
    case 'cosmosdb':
        if (!COSMOS_ENDPOINT || !COSMOS_KEY) {
            console.error('CosmosDB provider selected, but COSMOS_ENDPOINT or COSMOS_KEY is not set. Cannot initialize CosmosDbStore.');
            // Fallback to flatfile or throw error
            console.warn('Defaulting to FlatFileStore due to missing CosmosDB credentials.');
            store = new FlatFileStore(DATA_FILE_PATH);
        } else {
            console.log(`Initializing CosmosDB data store. Endpoint: ${COSMOS_ENDPOINT ? "provided" : "MISSING!"}, DB: ${COSMOS_DATABASE_ID}`);
            store = new CosmosDbStore(COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE_ID, COSMOS_PROJECTS_CONTAINER_ID, COSMOS_OBJECTIVES_CONTAINER_ID);
        }
        break;
    case 'flatfile':
    default: // Default to FlatFileStore if provider is unknown or 'flatfile'
        if (DATA_PROVIDER.toLowerCase() !== 'flatfile') {
            console.warn(`Invalid DATA_PROVIDER specified: ${DATA_PROVIDER}. Defaulting to FlatFileStore.`);
        }
        console.log(`Initializing FlatFileStore with path: ${DATA_FILE_PATH}`);
        store = new FlatFileStore(DATA_FILE_PATH);
        break;
}

// --- Initialize and Load Data ---
// This is an async operation. For a server environment, ensure this completes
// or is properly handled before the application starts serving requests that depend on it.
// For MongoDbStore, connect() is called within loadData().
store.loadData().then(() => {
    console.log(`Data store initialized and loaded successfully using ${DATA_PROVIDER} provider.`);
}).catch(error => {
    console.error(`Failed to initialize data store with ${DATA_PROVIDER} provider:`, error);
    // Application might need to handle this critical failure (e.g., exit or run in a degraded mode)
    // For now, if it's Mongo and it fails, subsequent operations will likely also fail.
    // If it's FlatFileStore, it might create an empty file, which could be acceptable.
});


// --- Delegated Functions ---
// All functions remain async as they interact with an async store.
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
