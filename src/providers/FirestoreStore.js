// src/providers/FirestoreStore.js
const { Firestore, Timestamp } = require('@google-cloud/firestore');
const DataStoreInterface = require('../interfaces/DataStoreInterface');
const Project = require('../models/Project');
const Objective = require('../models/Objective');

const PROJECTS_COLLECTION = 'projects';
const OBJECTIVES_COLLECTION = 'objectives';

class FirestoreStore extends DataStoreInterface {
    constructor(projectId, keyFilename) {
        super();
        this.firestore = new Firestore({
            projectId: projectId, // Google Cloud Project ID
            keyFilename: keyFilename, // Path to service account key file (optional, uses ADC if undefined)
        });
        this.projectsCollection = this.firestore.collection(PROJECTS_COLLECTION);
        this.objectivesCollection = this.firestore.collection(OBJECTIVES_COLLECTION);
        console.log(`FirestoreStore initialized for project ${projectId || 'default'}. ADC/Keyfile: ${keyFilename || 'ADC'}`);
    }

    // Firestore connection is managed by the client library.
    // loadData/saveData are more conceptual for Firestore.
    async loadData() {
        // For Firestore, this can be a no-op as data is fetched on demand.
        // We can use it to confirm connectivity if desired, but not strictly necessary.
        try {
            await this.firestore.listCollections(); // A simple operation to check connectivity
            console.log('FirestoreStore: Connection to Firestore confirmed.');
        } catch (error) {
            console.error('FirestoreStore: Failed to confirm connection to Firestore:', error);
            throw error;
        }
    }

    async saveData() {
        // Firestore saves data per operation. This can be a no-op.
        console.log('FirestoreStore: Data is saved per operation. No explicit global save needed.');
        return Promise.resolve();
    }

    _toFirestoreDoc(modelInstance) {
        const doc = { ...modelInstance };
        // Convert dates to Firestore Timestamps
        for (const key in doc) {
            if (doc[key] instanceof Date) {
                doc[key] = Timestamp.fromDate(doc[key]);
            }
            // Firestore cannot store 'undefined'
            if (doc[key] === undefined) {
                doc[key] = null;
            }
            if (key === 'chatHistory' && Array.isArray(doc.chatHistory)) {
                doc.chatHistory = doc.chatHistory.map(msg => {
                    const newMsg = {...msg};
                    if (newMsg.timestamp instanceof Date) {
                        newMsg.timestamp = Timestamp.fromDate(newMsg.timestamp);
                    }
                    return newMsg;
                });
            }
        }
        // Firestore uses the document ID as the key, so we don't store 'id' field within the document itself
        // if we use the model's ID as Firestore's document ID.
        delete doc.id;
        return doc;
    }

    _fromFirestoreDoc(docSnapshot, ModelClass) {
        if (!docSnapshot.exists) return null;
        const data = docSnapshot.data();
        const modelInstance = ModelClass === Project
            ? new Project(data.name, data.description)
            : new Objective(data.projectId, data.title, data.brief);

        // Assign all properties from Firestore data to the model instance
        Object.keys(data).forEach(key => {
            if (data[key] instanceof Timestamp) {
                modelInstance[key] = data[key].toDate();
            } else if (key === 'chatHistory' && Array.isArray(data.chatHistory)) {
                 modelInstance.chatHistory = data.chatHistory.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp instanceof Timestamp ? msg.timestamp.toDate() : new Date(msg.timestamp) // Handle if already converted or string
                }));
            }
            else {
                modelInstance[key] = data[key];
            }
        });
        modelInstance.id = docSnapshot.id; // Set the model ID from Firestore document ID

        // Ensure essential date fields if they weren't in doc (constructor should handle defaults)
        if (!modelInstance.createdAt) modelInstance.createdAt = new Date();
        if (!modelInstance.updatedAt) modelInstance.updatedAt = new Date();

        return modelInstance;
    }

    async addProject(projectData) {
        const projectInstance = new Project(projectData.name, projectData.description);
        Object.assign(projectInstance, projectData); // Apply other data

        const docRef = this.projectsCollection.doc(projectInstance.id); // Use model's ID as Firestore doc ID
        await docRef.set(this._toFirestoreDoc(projectInstance));
        return projectInstance; // Return the original instance with its ID
    }

    async getAllProjects() {
        const snapshot = await this.projectsCollection.get();
        return snapshot.docs.map(doc => this._fromFirestoreDoc(doc, Project));
    }

    async findProjectById(projectId) {
        const docRef = this.projectsCollection.doc(projectId);
        const docSnapshot = await docRef.get();
        return this._fromFirestoreDoc(docSnapshot, Project);
    }

    async updateProjectById(projectId, updateData) {
        const docRef = this.projectsCollection.doc(projectId);
        const updatePayload = { ...updateData };
        updatePayload.updatedAt = Timestamp.fromDate(new Date()); // Firestore Timestamp

        // Convert any Date objects in updateData to Timestamps
        for (const key in updatePayload) {
            if (updatePayload[key] instanceof Date) {
                updatePayload[key] = Timestamp.fromDate(updatePayload[key]);
            }
             // Firestore cannot store 'undefined'
            if (updatePayload[key] === undefined) {
                delete updatePayload[key]; // Or set to null if preferred
            }
        }

        await docRef.update(updatePayload);
        // Fetch the updated document to return a complete model instance
        const updatedDocSnapshot = await docRef.get();
        return this._fromFirestoreDoc(updatedDocSnapshot, Project);
    }

    async deleteProjectById(projectId) {
        // Firestore requires deleting subcollections separately if they exist.
        // For objectives, we query and delete them.
        const objectivesSnapshot = await this.objectivesCollection.where('projectId', '==', projectId).get();
        const batch = this.firestore.batch();
        objectivesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        await this.projectsCollection.doc(projectId).delete();
        return true; // Firestore delete doesn't return a count directly like Mongo
    }

    async addObjective(objectiveData, projectId) {
        const project = await this.findProjectById(projectId);
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found. Cannot add objective.`);
        }

        const objectiveInstance = new Objective(projectId, objectiveData.title, objectiveData.brief);
        Object.assign(objectiveInstance, objectiveData);

        const docRef = this.objectivesCollection.doc(objectiveInstance.id); // Use model's ID
        await docRef.set(this._toFirestoreDoc(objectiveInstance));
        return objectiveInstance;
    }

    async getObjectivesByProjectId(projectId) {
        const snapshot = await this.objectivesCollection.where('projectId', '==', projectId).get();
        return snapshot.docs.map(doc => this._fromFirestoreDoc(doc, Objective));
    }

    async getAllObjectives() {
        const snapshot = await this.objectivesCollection.get();
        return snapshot.docs.map(doc => this._fromFirestoreDoc(doc, Objective));
    }

    async findObjectiveById(objectiveId) {
        const docRef = this.objectivesCollection.doc(objectiveId);
        const docSnapshot = await docRef.get();
        return this._fromFirestoreDoc(docSnapshot, Objective);
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        const docRef = this.objectivesCollection.doc(objectiveId);
        const updatePayload = { ...objectiveData };
        updatePayload.updatedAt = Timestamp.fromDate(new Date());

        for (const key in updatePayload) {
            if (updatePayload[key] instanceof Date) {
                updatePayload[key] = Timestamp.fromDate(updatePayload[key]);
            }
             if (key === 'chatHistory' && Array.isArray(updatePayload.chatHistory)) {
                updatePayload.chatHistory = updatePayload.chatHistory.map(msg => {
                    const newMsg = {...msg};
                    if (newMsg.timestamp instanceof Date) {
                        newMsg.timestamp = Timestamp.fromDate(newMsg.timestamp);
                    }
                    return newMsg;
                });
            }
            if (updatePayload[key] === undefined) {
                 delete updatePayload[key];
            }
        }

        await docRef.update(updatePayload);
        const updatedDocSnapshot = await docRef.get();
        return this._fromFirestoreDoc(updatedDocSnapshot, Objective);
    }

    async deleteObjectiveById(objectiveId) {
        await this.objectivesCollection.doc(objectiveId).delete();
        return true;
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        const docRef = this.objectivesCollection.doc(objectiveId);
        const message = {
            speaker: sender,
            content: text,
            timestamp: Timestamp.fromDate(new Date()) // Use Firestore Timestamp
        };

        // Firestore's arrayUnion is good for adding unique elements.
        // For chat history, we typically append all messages.
        // A transaction or batched write might be better for atomicity if needed,
        // but for simplicity, a direct update with FieldValue.arrayUnion or manual array update.
        // Using FieldValue.arrayUnion to append to an array:
        // await docRef.update({ chatHistory: Firestore.FieldValue.arrayUnion(message), updatedAt: Timestamp.fromDate(new Date()) });
        // However, since chat messages are not unique, a simple push is more like arrayUnion if message objects are always new.
        // For a chat log, usually you read, append, and write back, or use arrayUnion if messages are considered unique sets.
        // Let's do a read-modify-write for simplicity here if arrayUnion isn't suitable for non-unique log entries.

        // Firestore does not have a direct "push" like Mongo. We use FieldValue.arrayUnion
        // or read the document, modify the array, and write it back.
        // For chat history, arrayUnion is fine as each message object is unique instance.

        try {
            await this.firestore.runTransaction(async (transaction) => {
                const objectiveDoc = await transaction.get(docRef);
                if (!objectiveDoc.exists) {
                    throw new Error("Objective not found for adding chat message.");
                }
                const currentData = objectiveDoc.data();
                const chatHistory = currentData.chatHistory || [];
                chatHistory.push(message);
                transaction.update(docRef, { chatHistory: chatHistory, updatedAt: Timestamp.fromDate(new Date()) });
            });
            return { ...message, timestamp: message.timestamp.toDate() }; // Convert timestamp back to Date for return
        } catch (error) {
            console.error(`Error adding message to objective ${objectiveId} chat:`, error);
            return null;
        }
    }
}

module.exports = FirestoreStore;
