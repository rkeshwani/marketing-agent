// src/providers/CosmosDbStore.js
const { CosmosClient } = require('@azure/cosmos');
const DataStoreInterface = require('../interfaces/DataStoreInterface');
const Project = require('../models/Project');
const Objective = require('../models/Objective');

class CosmosDbStore extends DataStoreInterface {
    constructor(endpoint, key, databaseId, projectsContainerId, objectivesContainerId) {
        super();
        this.client = new CosmosClient({ endpoint, key });
        this.databaseId = databaseId || 'agenticChatDB';
        this.projectsContainerId = projectsContainerId || 'Projects';
        this.objectivesContainerId = objectivesContainerId || 'Objectives';

        this.database = null;
        this.projectsContainer = null;
        this.objectivesContainer = null;

        console.log(`CosmosDbStore initialized. Endpoint: ${endpoint ? 'provided' : 'missing'}, Key: ${key ? 'provided' : 'missing'}, DB: ${this.databaseId}`);
    }

    async _initialize() {
        if (this.projectsContainer && this.objectivesContainer) {
            return;
        }
        try {
            const { database } = await this.client.databases.createIfNotExists({ id: this.databaseId });
            this.database = database;

            const { container: projectsContainerResult } = await this.database.containers.createIfNotExists({
                id: this.projectsContainerId,
                partitionKey: { paths: ['/id'] } // Using /id as partition key for Projects
            });
            this.projectsContainer = projectsContainerResult;

            const { container: objectivesContainerResult } = await this.database.containers.createIfNotExists({
                id: this.objectivesContainerId,
                // Objectives are often queried by projectId. Using projectId as partition key.
                // If 'id' (objectiveId) is also frequently used for point reads,
                // and projectId is high cardinality, this is a good choice.
                // Alternatively, if projectId is low cardinality, another key or composite key might be better.
                partitionKey: { paths: ['/projectId'] }
            });
            this.objectivesContainer = objectivesContainerResult;

            console.log(`Cosmos DB database '${this.databaseId}' and containers '${this.projectsContainerId}', '${this.objectivesContainerId}' initialized.`);
        } catch (error) {
            console.error('Failed to initialize Cosmos DB database or containers:', error.message);
            if (error.code === 401 || error.code === 'Unauthorized') {
                console.error('Cosmos DB Authorization error: Ensure COSMOS_ENDPOINT and COSMOS_KEY are correct.');
            }
            throw error;
        }
    }

    // loadData is conceptual for Cosmos DB; initialization is key.
    async loadData() {
        await this._initialize();
        console.log('CosmosDbStore: Data loading conceptually complete (DB initialized).');
    }

    async saveData() {
        console.log('CosmosDbStore: Data is saved per operation. No explicit global save needed.');
        return Promise.resolve();
    }

    _toCosmosItem(modelInstance) {
        const item = { ...modelInstance };
        // Convert Dates to ISO strings
        for (const key in item) {
            if (item[key] instanceof Date) {
                item[key] = item[key].toISOString();
            }
            if (key === 'chatHistory' && Array.isArray(item.chatHistory)) {
                item.chatHistory = item.chatHistory.map(msg => {
                    const newMsg = {...msg};
                    if (newMsg.timestamp instanceof Date) {
                        newMsg.timestamp = newMsg.timestamp.toISOString();
                    }
                    return newMsg;
                });
            }
            if (item[key] === undefined) {
                // Cosmos DB can store null, but not undefined directly via SDK typically.
                // Depending on strictness, either delete or set to null.
                delete item[key];
            }
        }
        // The model's 'id' field is used as Cosmos DB item 'id'.
        return item;
    }

    _fromCosmosItem(itemData, ModelClass) {
        if (!itemData) return null;
        const modelData = { ...itemData };
        // Convert ISO strings back to Dates
        for (const key in modelData) {
            if (['createdAt', 'updatedAt', 'nextRunTime'].includes(key) && typeof modelData[key] === 'string') {
                modelData[key] = new Date(modelData[key]);
            }
             if (key === 'chatHistory' && Array.isArray(modelData.chatHistory)) {
                modelData.chatHistory = modelData.chatHistory.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
            }
        }

        const modelInstance = ModelClass === Project
            ? new Project(modelData.name, modelData.description)
            : new Objective(modelData.projectId, modelData.title, modelData.brief);

        Object.assign(modelInstance, modelData); // modelData contains 'id' from Cosmos DB
        return modelInstance;
    }

    async addProject(projectData) {
        await this._initialize();
        const projectInstance = new Project(projectData.name, projectData.description);
        Object.assign(projectInstance, projectData);

        const item = this._toCosmosItem(projectInstance);
        // 'id' from projectInstance is used as item id for Cosmos.
        await this.projectsContainer.items.create(item);
        return projectInstance;
    }

    async getAllProjects() {
        await this._initialize();
        const { resources: items } = await this.projectsContainer.items.readAll().fetchAll();
        return items.map(item => this._fromCosmosItem(item, Project));
    }

    async findProjectById(projectId) {
        await this._initialize();
        // For projects, 'id' is the partition key.
        const { resource: item } = await this.projectsContainer.item(projectId, projectId).read();
        return this._fromCosmosItem(item, Project);
    }

    async updateProjectById(projectId, updateData) {
        await this._initialize();
        const currentProject = await this.findProjectById(projectId);
        if (!currentProject) return null;

        const updatedProjectInstance = new Project(currentProject.name, currentProject.description);
        Object.assign(updatedProjectInstance, currentProject); // Start with current state
        Object.assign(updatedProjectInstance, updateData);   // Apply updates
        updatedProjectInstance.updatedAt = new Date();       // Set new updatedAt

        const itemToUpdate = this._toCosmosItem(updatedProjectInstance);

        // Cosmos DB replace operation: item must contain id.
        // The partition key value must also be passed if it's different from id,
        // but for projects, id is the partition key.
        const { resource: replacedItem } = await this.projectsContainer.item(projectId, projectId).replace(itemToUpdate);
        return this._fromCosmosItem(replacedItem, Project);
    }

    async deleteProjectById(projectId) {
        await this._initialize();
        // Delete associated objectives first.
        // Objectives are partitioned by projectId, so this query is efficient.
        const querySpec = {
            query: "SELECT * FROM Objectives o WHERE o.projectId = @projectId",
            parameters: [{ name: "@projectId", value: projectId }]
        };
        const { resources: objectivesToDelete } = await this.objectivesContainer.items.query(querySpec).fetchAll();

        for (const objective of objectivesToDelete) {
            // For objectives, objective.id is the item id, and objective.projectId is the partition key.
            await this.objectivesContainer.item(objective.id, objective.projectId).delete();
        }

        // Delete the project itself. 'id' is the partition key for projects.
        await this.projectsContainer.item(projectId, projectId).delete();
        return true;
    }

    async addObjective(objectiveData, projectId) {
        await this._initialize();
        const project = await this.findProjectById(projectId);
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found. Cannot add objective.`);
        }
        const objectiveInstance = new Objective(projectId, objectiveData.title, objectiveData.brief);
        Object.assign(objectiveInstance, objectiveData);

        const item = this._toCosmosItem(objectiveInstance);
        // 'id' from objectiveInstance is used as item id. 'projectId' is the partition key.
        await this.objectivesContainer.items.create(item);
        return objectiveInstance;
    }

    async getObjectivesByProjectId(projectId) {
        await this._initialize();
        // Querying with partition key is efficient.
        const querySpec = {
            query: "SELECT * FROM Objectives o WHERE o.projectId = @projectId",
            parameters: [{ name: "@projectId", value: projectId }]
        };
        // Since projectId is the partition key, we can also use readAll with partitionKey option
        // However, a query is more explicit if further filtering were added.
        // For items.query, if the query is scoped to a single partition key (like here),
        // it's efficient.
        const { resources: items } = await this.objectivesContainer.items.query(querySpec, { partitionKey: projectId }).fetchAll();
        return items.map(item => this._fromCosmosItem(item, Objective));
    }

    async getAllObjectives() {
        await this._initialize();
        // This will be a cross-partition query, potentially less efficient for large datasets.
        const { resources: items } = await this.objectivesContainer.items.readAll().fetchAll();
        return items.map(item => this._fromCosmosItem(item, Objective));
    }

    async findObjectiveById(objectiveId) {
        await this._initialize();
        // This is tricky if we don't know the objective's projectId (its partition key).
        // A cross-partition query would be needed, which is inefficient for point reads.
        // Option 1: Query across partitions (less ideal for point read by ID).
        // Option 2: Store objectives with a known fixed partition key if this is a common pattern
        //           and objectiveId is globally unique (our model's ID is).
        // Option 3: Require projectId to be passed to findObjectiveById (changes interface).
        // For now, implementing with a cross-partition query.
        // This assumes objective 'id' is unique across all projects.
        const querySpec = {
            query: "SELECT * FROM Objectives o WHERE o.id = @objectiveId",
            parameters: [{ name: "@objectiveId", value: objectiveId }]
        };
        const { resources: items } = await this.objectivesContainer.items.query(querySpec).fetchAll();
        if (items.length > 0) {
            return this._fromCosmosItem(items[0], Objective);
        }
        return null;
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        await this._initialize();
        // To update, we need the item's partition key (projectId).
        // First, fetch the objective to get its projectId. This is inefficient.
        // A better design might involve passing projectId or having a different data model/indexing.
        const currentObjective = await this.findObjectiveById(objectiveId); // This does a cross-partition query
        if (!currentObjective) return null;

        const updatedObjectiveInstance = new Objective(currentObjective.projectId, currentObjective.title, currentObjective.brief);
        Object.assign(updatedObjectiveInstance, currentObjective);
        Object.assign(updatedObjectiveInstance, objectiveData);
        updatedObjectiveInstance.updatedAt = new Date();

        const itemToUpdate = this._toCosmosItem(updatedObjectiveInstance);

        // Use the fetched projectId as the partition key for the update.
        const { resource: replacedItem } = await this.objectivesContainer.item(objectiveId, currentObjective.projectId).replace(itemToUpdate);
        return this._fromCosmosItem(replacedItem, Objective);
    }

    async deleteObjectiveById(objectiveId) {
        await this._initialize();
        // Similar to update, we need the partition key (projectId).
        const objectiveToDelete = await this.findObjectiveById(objectiveId); // Cross-partition query
        if (!objectiveToDelete) return false; // Or throw error

        await this.objectivesContainer.item(objectiveId, objectiveToDelete.projectId).delete();
        return true;
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        await this._initialize();
        const objective = await this.findObjectiveById(objectiveId); // Cross-partition query
        if (!objective) {
            throw new Error(`Objective with ID ${objectiveId} not found.`);
        }

        const message = {
            speaker: sender,
            content: text,
            timestamp: new Date().toISOString() // Store as ISO string
        };

        objective.chatHistory = objective.chatHistory || [];
        objective.chatHistory.push(this._toCosmosItem(message)); // Ensure message timestamps are also ISO
        objective.updatedAt = new Date();

        const itemToUpdate = this._toCosmosItem(objective);

        // Use objective's projectId as partition key
        await this.objectivesContainer.item(objectiveId, objective.projectId).replace(itemToUpdate);
        // Return message with Date object for timestamp
        return { ...message, timestamp: new Date(message.timestamp) };
    }
}

module.exports = CosmosDbStore;
