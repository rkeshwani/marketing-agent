// src/providers/DynamoDbStore.js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand,
    QueryCommand
} = require('@aws-sdk/lib-dynamodb');
const DataStoreInterface = require('../interfaces/DataStoreInterface');
const Project = require('../models/Project');
const Objective = require('../models/Objective');

// Constants for GSI, if we decide to use one for objectives by projectId
const OBJECTIVES_BY_PROJECT_ID_INDEX = 'ObjectivesByProjectIdIndex';

class DynamoDbStore extends DataStoreInterface {
    constructor(region, projectsTableName, objectivesTableName) {
        super();
        const client = new DynamoDBClient({ region: region || process.env.AWS_REGION });
        this.docClient = DynamoDBDocumentClient.from(client);
        this.projectsTableName = projectsTableName || process.env.DYNAMODB_PROJECTS_TABLE || 'agentic-chat-projects';
        this.objectivesTableName = objectivesTableName || process.env.DYNAMODB_OBJECTIVES_TABLE || 'agentic-chat-objectives';
        console.log(`DynamoDbStore initialized. Region: ${region || process.env.AWS_REGION}, Projects Table: ${this.projectsTableName}, Objectives Table: ${this.objectivesTableName}`);
    }

    // Connection is managed by SDK. loadData/saveData are conceptual.
    async loadData() {
        // Can add a simple GetItem or DescribeTable to check connectivity/table existence if desired.
        console.log('DynamoDbStore: Connection conceptually established (SDK manages connections).');
        return Promise.resolve();
    }

    async saveData() {
        console.log('DynamoDbStore: Data is saved per operation. No explicit global save needed.');
        return Promise.resolve();
    }

    _toDynamoDbItem(modelInstance) {
        const item = { ...modelInstance };
        // Convert Dates to ISO strings for DynamoDB
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
            // DynamoDB doesn't like empty strings for some types, or undefined.
            // Store null instead of undefined. Empty strings are usually fine.
            if (item[key] === undefined) {
                delete item[key]; // Or set to null if the attribute should exist
            }
        }
        return item;
    }

    _fromDynamoDbItem(item, ModelClass) {
        if (!item) return null;
        const modelData = { ...item };
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

        // Assign all properties from DynamoDB item to the model instance,
        // overriding constructor defaults if present in modelData.
        Object.assign(modelInstance, modelData);

        return modelInstance;
    }

    async addProject(projectData) {
        const projectInstance = new Project(projectData.name, projectData.description);
        Object.assign(projectInstance, projectData); // Apply other data

        const item = this._toDynamoDbItem(projectInstance);
        const command = new PutCommand({
            TableName: this.projectsTableName,
            Item: item,
        });
        await this.docClient.send(command);
        return projectInstance; // Return model instance as stored
    }

    async getAllProjects() {
        const command = new ScanCommand({ TableName: this.projectsTableName });
        const { Items } = await this.docClient.send(command);
        return Items ? Items.map(item => this._fromDynamoDbItem(item, Project)) : [];
    }

    async findProjectById(projectId) {
        const command = new GetCommand({
            TableName: this.projectsTableName,
            Key: { id: projectId },
        });
        const { Item } = await this.docClient.send(command);
        return this._fromDynamoDbItem(Item, Project);
    }

    async updateProjectById(projectId, updateData) {
        // DynamoDB UpdateCommand needs specific UpdateExpression and ExpressionAttributeValues
        let updateExpression = 'set';
        const expressionAttributeValues = {};
        const expressionAttributeNames = {}; // For attribute names that are reserved keywords

        let first = true;
        for (const key in updateData) {
            if (key === 'id') continue; // Cannot update primary key
            if (!first) updateExpression += ',';
            // Handle reserved keywords if any attribute name is a reserved word
            // For now, assuming no reserved words in common Project/Objective fields.
            // Example: expressionAttributeNames[`#${key}`] = key; updateExpression += ` #${key} = :${key}`;
            updateExpression += ` ${key} = :${key}`;
            expressionAttributeValues[`:${key}`] = updateData[key] instanceof Date ? updateData[key].toISOString() : updateData[key];
            first = false;
        }
        updateExpression += `${first ? '' : ','} updatedAt = :updatedAt`; // Always update updatedAt
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        if (Object.keys(expressionAttributeValues).length === 1 && expressionAttributeValues[':updatedAt']) {
             // Only updatedAt is being set, which means updateData was empty or only had 'id'
             console.warn(`DynamoDbStore.updateProjectById: No updatable fields provided for project ${projectId} other than 'updatedAt'.`);
             // If we only want to update 'updatedAt', the expression is fine.
        }
        if (first && !expressionAttributeValues[':updatedAt']) { // No fields to update
             console.warn(`DynamoDbStore.updateProjectById: No fields to update for project ${projectId}.`);
             return this.findProjectById(projectId); // Return current state
        }


        const command = new UpdateCommand({
            TableName: this.projectsTableName,
            Key: { id: projectId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            // ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
            ReturnValues: 'ALL_NEW', // Returns all attributes of the item as they appear after the update.
        });
        try {
            const { Attributes } = await this.docClient.send(command);
            return this._fromDynamoDbItem(Attributes, Project);
        } catch (error) {
            console.error(`Error updating project ${projectId} in DynamoDB:`, error);
            throw error;
        }
    }

    async deleteProjectById(projectId) {
        // 1. Find all objectives for this project
        const objectives = await this.getObjectivesByProjectId(projectId);
        // 2. Delete each objective (DynamoDB doesn't have cascade delete or multi-item transactions in the simple sense)
        // For batch deletion, you'd use BatchWriteItem, but it has limits.
        // Sequential deletes are simpler for now.
        for (const objective of objectives) {
            await this.deleteObjectiveById(objective.id);
        }
        // 3. Delete the project
        const command = new DeleteCommand({
            TableName: this.projectsTableName,
            Key: { id: projectId },
        });
        await this.docClient.send(command);
        return true; // Assuming success if no error
    }

    async addObjective(objectiveData, projectId) {
        const project = await this.findProjectById(projectId);
        if (!project) {
            throw new Error(`Project with ID ${projectId} not found. Cannot add objective.`);
        }
        const objectiveInstance = new Objective(projectId, objectiveData.title, objectiveData.brief);
        Object.assign(objectiveInstance, objectiveData);

        const item = this._toDynamoDbItem(objectiveInstance);
        const command = new PutCommand({
            TableName: this.objectivesTableName,
            Item: item,
        });
        await this.docClient.send(command);
        return objectiveInstance;
    }

    async getObjectivesByProjectId(projectId) {
        // This query assumes a Global Secondary Index (GSI) on 'projectId'
        // If no GSI, a Scan would be needed, which is less efficient.
        // For this example, let's assume a GSI named 'ObjectivesByProjectIdIndex' exists.
        // If you don't have a GSI, you would use a Scan with a FilterExpression.
        const command = new QueryCommand({
            TableName: this.objectivesTableName,
            IndexName: OBJECTIVES_BY_PROJECT_ID_INDEX, // Specify the GSI name
            KeyConditionExpression: 'projectId = :projectIdVal',
            ExpressionAttributeValues: {
                ':projectIdVal': projectId,
            },
        });
        try {
            const { Items } = await this.docClient.send(command);
            return Items ? Items.map(item => this._fromDynamoDbItem(item, Objective)) : [];
        } catch (error) {
            // Fallback to Scan if GSI query fails (e.g., GSI not configured)
            // THIS IS INEFFICIENT and should be avoided in production.
            console.warn(`DynamoDbStore: Query on GSI '${OBJECTIVES_BY_PROJECT_ID_INDEX}' failed (error: ${error.message}). Falling back to Scan for getObjectivesByProjectId. Configure GSI for better performance.`);
            const scanCommand = new ScanCommand({
                TableName: this.objectivesTableName,
                FilterExpression: 'projectId = :projectIdVal',
                ExpressionAttributeValues: { ':projectIdVal': projectId },
            });
            const { Items } = await this.docClient.send(scanCommand);
            return Items ? Items.map(item => this._fromDynamoDbItem(item, Objective)) : [];
        }
    }

    async getAllObjectives() {
        const command = new ScanCommand({ TableName: this.objectivesTableName });
        const { Items } = await this.docClient.send(command);
        return Items ? Items.map(item => this._fromDynamoDbItem(item, Objective)) : [];
    }

    async findObjectiveById(objectiveId) {
        const command = new GetCommand({
            TableName: this.objectivesTableName,
            Key: { id: objectiveId },
        });
        const { Item } = await this.docClient.send(command);
        return this._fromDynamoDbItem(Item, Objective);
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        let updateExpression = 'set';
        const expressionAttributeValues = {};
        // const expressionAttributeNames = {}; // If needed for reserved words

        let first = true;
        for (const key in objectiveData) {
            if (key === 'id') continue;
            if (!first) updateExpression += ',';

            let value = objectiveData[key];
            if (value instanceof Date) {
                value = value.toISOString();
            } else if (key === 'chatHistory' && Array.isArray(value)) {
                value = value.map(msg => ({
                    ...msg,
                    timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date(msg.timestamp).toISOString()
                }));
            }

            updateExpression += ` ${key} = :${key}`;
            expressionAttributeValues[`:${key}`] = value;
            first = false;
        }
        updateExpression += `${first ? '' : ','} updatedAt = :updatedAt`;
        expressionAttributeValues[':updatedAt'] = new Date().toISOString();

        if (Object.keys(expressionAttributeValues).length === 1 && expressionAttributeValues[':updatedAt']) {
             console.warn(`DynamoDbStore.updateObjectiveById: No updatable fields provided for objective ${objectiveId} other than 'updatedAt'.`);
        }
         if (first && !expressionAttributeValues[':updatedAt']) {
             console.warn(`DynamoDbStore.updateObjectiveById: No fields to update for objective ${objectiveId}.`);
             return this.findObjectiveById(objectiveId);
        }

        const command = new UpdateCommand({
            TableName: this.objectivesTableName,
            Key: { id: objectiveId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });
         try {
            const { Attributes } = await this.docClient.send(command);
            return this._fromDynamoDbItem(Attributes, Objective);
        } catch (error) {
            console.error(`Error updating objective ${objectiveId} in DynamoDB:`, error);
            throw error;
        }
    }

    async deleteObjectiveById(objectiveId) {
        const command = new DeleteCommand({
            TableName: this.objectivesTableName,
            Key: { id: objectiveId },
        });
        await this.docClient.send(command);
        return true;
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        const message = {
            speaker: sender,
            content: text,
            timestamp: new Date().toISOString() // Store as ISO string
        };

        // For DynamoDB, to append to a list, you use list_append function
        // This requires the attribute to exist as a list.
        // If it might not exist, you'd use `if_not_exists(chatHistory, :empty_list)`
        const command = new UpdateCommand({
            TableName: this.objectivesTableName,
            Key: { id: objectiveId },
            UpdateExpression: 'set chatHistory = list_append(if_not_exists(chatHistory, :empty_list), :newMessage), updatedAt = :updatedAtVal',
            ExpressionAttributeValues: {
                ':newMessage': [message], // list_append expects a list
                ':empty_list': [],
                ':updatedAtVal': new Date().toISOString(),
            },
            ReturnValues: 'UPDATED_NEW', // Get the updated chatHistory
        });
        try {
            await this.docClient.send(command);
            return { ...message, timestamp: new Date(message.timestamp) }; // Return with Date object
        } catch (error) {
            console.error(`Error adding message to objective ${objectiveId} chat in DynamoDB:`, error);
            // Could try to fetch the objective to see if it exists as a separate check
            const objective = await this.findObjectiveById(objectiveId);
            if (!objective) {
                throw new Error(`Objective with ID ${objectiveId} not found.`);
            }
            throw error; // Re-throw original error if objective exists but update failed
        }
    }
}

module.exports = DynamoDbStore;
