// src/providers/MongoDbStore.js
const { MongoClient, ObjectId } = require('mongodb');
const DataStoreInterface = require('../interfaces/DataStoreInterface');
const Project = require('../models/Project');
const Objective = require('../models/Objective');

class MongoDbStore extends DataStoreInterface {
    constructor(uri, dbName) {
        super();
        this.uri = uri;
        this.dbName = dbName;
        this.client = new MongoClient(this.uri);
        this.db = null;
        this.projectsCollection = null;
        this.objectivesCollection = null;
    }

    async connect() {
        if (this.db) {
            return;
        }
        try {
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.projectsCollection = this.db.collection('projects');
            this.objectivesCollection = this.db.collection('objectives');
            console.log('Successfully connected to MongoDB.');
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            throw error; // Re-throw to indicate connection failure
        }
    }

    async disconnect() {
        try {
            await this.client.close();
            this.db = null;
            this.projectsCollection = null;
            this.objectivesCollection = null;
            console.log('Successfully disconnected from MongoDB.');
        } catch (error) {
            console.error('Failed to disconnect from MongoDB:', error);
            throw error;
        }
    }

    // Helper to ensure connection before operations
    async _ensureConnected() {
        if (!this.db) {
            await this.connect();
        }
    }

    // Data load/save are conceptual for MongoDB; connection is the key.
    // These methods are part of the interface, so we provide basic implementations.
    async loadData() {
        // For MongoDB, "loading" data is essentially ensuring a connection.
        // Actual data fetching happens in specific methods like getAllProjects.
        await this._ensureConnected();
        console.log('MongoDBStore: Data loading conceptually complete (connection established).');
    }

    async saveData() {
        // MongoDB saves data per operation (insert, update).
        // This method can be a no-op or log, as it's part of the interface.
        console.log('MongoDBStore: Data is saved per operation. No explicit global save needed.');
        return Promise.resolve();
    }

    _convertToObjectId(id) {
        if (id instanceof ObjectId) return id;
        if (typeof id === 'string' && ObjectId.isValid(id)) {
            return new ObjectId(id);
        }
        // If it's not a valid ObjectId string or already an ObjectId,
        // it might be a custom string ID. For this store, we'll assume
        // all document _id fields managed by MongoDB are ObjectIds.
        // If we are searching by a custom 'id' field (not '_id'),
        // then this conversion is not for that field.
        return id; // Return original if not convertible to ObjectId for '_id'
    }

    _mapToProjectModel(doc) {
        if (!doc) return null;
        const project = new Project(doc.name, doc.description);
        // MongoDB uses _id, our model uses id. We need to map this.
        // Also, other properties from the doc should be assigned.
        Object.keys(doc).forEach(key => {
            if (key === '_id') {
                project.id = doc._id.toHexString(); // Store hex string version of ObjectId
            } else if (key !== 'name' && key !== 'description') {
                 // Ensure dates are reconstructed as Date objects
                if (['createdAt', 'updatedAt'].includes(key) && doc[key]) {
                    project[key] = new Date(doc[key]);
                } else {
                    project[key] = doc[key];
                }
            }
        });
        // Ensure essential date fields if they weren't in doc (though Project constructor should handle this)
        if (!project.createdAt) project.createdAt = new Date();
        if (!project.updatedAt) project.updatedAt = new Date();
        return project;
    }

    _mapToObjectiveModel(doc) {
        if (!doc) return null;
        // Objective constructor: projectId, title, brief
        const objective = new Objective(doc.projectId, doc.title, doc.brief);
        Object.keys(doc).forEach(key => {
            if (key === '_id') {
                objective.id = doc._id.toHexString();
            } else if (!['projectId', 'title', 'brief'].includes(key)) {
                 if (['createdAt', 'updatedAt', 'nextRunTime'].includes(key) && doc[key]) {
                    objective[key] = new Date(doc[key]);
                } else if (key === 'chatHistory' && Array.isArray(doc.chatHistory)) {
                    objective.chatHistory = doc.chatHistory.map(msg => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }));
                }
                else {
                    objective[key] = doc[key];
                }
            }
        });
        if (!objective.createdAt) objective.createdAt = new Date();
        if (!objective.updatedAt) objective.updatedAt = new Date();
        return objective;
    }


    async addProject(projectData) {
        await this._ensureConnected();
        // Create a new Project instance to get generated ID, createdAt, updatedAt
        const projectInstance = new Project(projectData.name, projectData.description);

        // Merge other fields from projectData into the instance
        Object.assign(projectInstance, projectData);

        // Prepare document for MongoDB, excluding model's 'id' if we want MongoDB to generate '_id'
        // Or, use model's 'id' as a custom field if preferred over ObjectId for primary key.
        // For this example, let's use the model's `id` as a string field `customId` and let Mongo generate `_id`.
        // Or, more simply, store the model's `id` also as `id` in the document.
        const projectDocument = {
            ...projectInstance, // Spread the instance properties
            // _id will be generated by MongoDB automatically
            // Ensure Date objects are correctly stored
            createdAt: new Date(projectInstance.createdAt),
            updatedAt: new Date(projectInstance.updatedAt)
        };
        // Remove the 'id' that came from the constructor if we want to rely on MongoDB's _id primarily
        // and then map it back. Or, if we use a custom string ID, ensure it's unique.
        // Let's assume Project constructor's `id` is the canonical one for the app.
        // So we store it directly. If `id` should be the mongo `_id`, then we'd convert it.

        const result = await this.projectsCollection.insertOne(projectDocument);
        // The insertedId from MongoDB is an ObjectId. We might want to return the model instance
        // with its original string ID, or update the instance with the _id.
        // For consistency with FlatFileStore, let's assume `projectInstance` is what we return.
        // If MongoDB generated the _id, we could assign it back: projectInstance.id = result.insertedId.toHexString();
        return this._mapToProjectModel({ ...projectDocument, _id: result.insertedId });
    }

    async getAllProjects() {
        await this._ensureConnected();
        const projectDocs = await this.projectsCollection.find({}).toArray();
        return projectDocs.map(doc => this._mapToProjectModel(doc));
    }

    async findProjectById(projectId) {
        await this._ensureConnected();
        // If projectId is expected to be MongoDB's _id, convert it.
        // If it's our custom string ID, query by that field.
        // Assuming our model's `id` is stored as `id` in the document.
        const projectDoc = await this.projectsCollection.findOne({ id: projectId });
        return this._mapToProjectModel(projectDoc);
    }

    async updateProjectById(projectId, updateData) {
        await this._ensureConnected();
        const updatePayload = { ...updateData };
        updatePayload.updatedAt = new Date();

        // Ensure dates in updateData are Date objects if they exist
        if (updatePayload.createdAt) updatePayload.createdAt = new Date(updatePayload.createdAt);

        // If assets is part of updateData, ensure it's handled correctly (e.g. not removing other fields)
        // Using $set operator to only update specified fields
        const result = await this.projectsCollection.findOneAndUpdate(
            { id: projectId },
            { $set: updatePayload },
            { returnDocument: 'after' }
        );
        return this._mapToProjectModel(result.value);
    }

    async deleteProjectById(projectId) {
        await this._ensureConnected();
        // Also delete associated objectives
        await this.objectivesCollection.deleteMany({ projectId: projectId });
        const result = await this.projectsCollection.deleteOne({ id: projectId });
        return result.deletedCount > 0;
    }

    async addObjective(objectiveData, projectId) {
        await this._ensureConnected();
        const project = await this.findProjectById(projectId);
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found. Cannot add objective.`);
        }

        const objectiveInstance = new Objective(projectId, objectiveData.title, objectiveData.brief);
        Object.assign(objectiveInstance, objectiveData); // Apply other data

        const objectiveDocument = {
            ...objectiveInstance,
            createdAt: new Date(objectiveInstance.createdAt),
            updatedAt: new Date(objectiveInstance.updatedAt),
            // Ensure chatHistory timestamps are Date objects if provided
            chatHistory: (objectiveInstance.chatHistory || []).map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            })),
            nextRunTime: objectiveInstance.nextRunTime ? new Date(objectiveInstance.nextRunTime) : null

        };

        const result = await this.objectivesCollection.insertOne(objectiveDocument);
        return this._mapToObjectiveModel({ ...objectiveDocument, _id: result.insertedId });
    }

    async getObjectivesByProjectId(projectId) {
        await this._ensureConnected();
        const objectiveDocs = await this.objectivesCollection.find({ projectId: projectId }).toArray();
        return objectiveDocs.map(doc => this._mapToObjectiveModel(doc));
    }

    async getAllObjectives() {
        await this._ensureConnected();
        const objectiveDocs = await this.objectivesCollection.find({}).toArray();
        return objectiveDocs.map(doc => this._mapToObjectiveModel(doc));
    }

    async findObjectiveById(objectiveId) {
        await this._ensureConnected();
        const objectiveDoc = await this.objectivesCollection.findOne({ id: objectiveId });
        return this._mapToObjectiveModel(objectiveDoc);
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        await this._ensureConnected();
        const updatePayload = { ...objectiveData };
        updatePayload.updatedAt = new Date();

        // Ensure dates are correctly formatted for MongoDB
        if (updatePayload.createdAt) updatePayload.createdAt = new Date(updatePayload.createdAt);
        if (updatePayload.nextRunTime) updatePayload.nextRunTime = new Date(updatePayload.nextRunTime);
        if (updatePayload.chatHistory) {
            updatePayload.chatHistory = updatePayload.chatHistory.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
            }));
        }

        const result = await this.objectivesCollection.findOneAndUpdate(
            { id: objectiveId },
            { $set: updatePayload },
            { returnDocument: 'after' }
        );
        return this._mapToObjectiveModel(result.value);
    }

    async deleteObjectiveById(objectiveId) {
        await this._ensureConnected();
        const result = await this.objectivesCollection.deleteOne({ id: objectiveId });
        return result.deletedCount > 0;
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        await this._ensureConnected();
        const message = {
            speaker: sender,
            content: text,
            timestamp: new Date()
        };
        const result = await this.objectivesCollection.findOneAndUpdate(
            { id: objectiveId },
            {
                $push: { chatHistory: message },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );
        if (result.value) {
            return message; // Return the message that was added
        }
        return null; // Or throw error if objective not found
    }
}

module.exports = MongoDbStore;
