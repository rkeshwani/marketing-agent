// src/providers/FlatFileStore.js
const fs = require('fs').promises; // Using promises version of fs
const path = require('path');
const DataStoreInterface = require('../interfaces/DataStoreInterface');
const Project = require('../models/Project');
const Objective = require('../models/Objective');

const DATA_FILE_PATH_DEFAULT = path.join(__dirname, '..', '..', 'data.json'); // Adjusted path

class FlatFileStore extends DataStoreInterface {
    constructor(filePath = DATA_FILE_PATH_DEFAULT) {
        super();
        this.filePath = filePath;
        this.projects = [];
        this.objectives = [];
        // No initial loadData call here, will be called explicitly by dataStore.js or tests
    }

    async loadData() {
        try {
            const fileExists = await fs.access(this.filePath).then(() => true).catch(() => false);
            if (fileExists) {
                const jsonData = await fs.readFile(this.filePath, 'utf8');
                const data = JSON.parse(jsonData);

                this.projects = (data.projects || []).map(p => {
                    const project = new Project(p.name, p.description);
                    for (const key in p) {
                        if (key !== 'name' && key !== 'description') {
                            project[key] = p[key];
                        }
                    }
                    if (p.createdAt) project.createdAt = new Date(p.createdAt);
                    if (p.updatedAt) project.updatedAt = new Date(p.updatedAt);
                    return project;
                });

                this.objectives = (data.objectives || []).map(o => {
                    const objective = new Objective(o.projectId, o.title, o.brief);
                    for (const key in o) {
                        if (!['projectId', 'title', 'brief', 'id', 'createdAt', 'updatedAt', 'chatHistory', 'plan'].includes(key)) {
                            objective[key] = o[key];
                        }
                    }
                    if (o.plan) {
                        objective.plan = { ...objective.plan, ...o.plan };
                    }
                    if(o.id) objective.id = o.id;
                    if(o.createdAt) objective.createdAt = new Date(o.createdAt);
                    if(o.updatedAt) objective.updatedAt = new Date(o.updatedAt);
                    if (o.chatHistory) {
                        objective.chatHistory = o.chatHistory.map(message => ({
                            ...message,
                            timestamp: new Date(message.timestamp)
                        }));
                    }
                    return objective;
                });
                console.log('Data loaded and instances reconstructed from', this.filePath);
            } else {
                console.log('No data file found. Initializing with empty data and creating file.');
                this.projects = [];
                this.objectives = [];
                await this.saveData(); // Create data.json with empty arrays if it doesn't exist
            }
        } catch (error) {
            console.error('Error loading data from file:', error);
            this.projects = [];
            this.objectives = [];
            // Optionally re-throw or handle more gracefully
        }
    }

    async saveData() {
        try {
            const data = {
                projects: this.projects,
                objectives: this.objectives
            };
            await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
            console.log('Data saved to', this.filePath);
        } catch (error) {
            console.error('Error saving data to file:', error);
            // Optionally re-throw or handle more gracefully
        }
    }

    async addProject(projectData) {
        const newProject = new Project(projectData.name, projectData.description);
        newProject.facebookUserAccessToken = projectData.facebookUserAccessToken || null;
        newProject.facebookUserID = projectData.facebookUserID || null;
        newProject.facebookSelectedPageID = projectData.facebookSelectedPageID || null;
        newProject.facebookPageName = projectData.facebookPageName || null;
        newProject.facebookPageAccessToken = projectData.facebookPageAccessToken || null;
        newProject.facebookPermissions = projectData.facebookPermissions || [];
        newProject.tiktokAccessToken = projectData.tiktokAccessToken || null;
        newProject.tiktokUserID = projectData.tiktokUserID || null;
        newProject.tiktokPermissions = projectData.tiktokPermissions || [];
        newProject.linkedinAccessToken = projectData.linkedinAccessToken || null;
        newProject.linkedinUserID = projectData.linkedinUserID || null;
        newProject.linkedinUserFirstName = projectData.linkedinUserFirstName || null;
        newProject.linkedinUserLastName = projectData.linkedinUserLastName || null;
        newProject.linkedinUserEmail = projectData.linkedinUserEmail || null;
        newProject.linkedinPermissions = projectData.linkedinPermissions || [];
        newProject.googleDriveFolderId = projectData.googleDriveFolderId || null;
        newProject.googleDriveAccessToken = projectData.googleDriveAccessToken || null;
        newProject.googleDriveRefreshToken = projectData.googleDriveRefreshToken || null;
        newProject.assets = projectData.assets || [];
        newProject.wordpressUrl = projectData.wordpressUrl || null;
        newProject.wordpressUsername = projectData.wordpressUsername || null;
        newProject.wordpressApplicationPassword = projectData.wordpressApplicationPassword || null;

        this.projects.push(newProject);
        console.log(`[FlatFileStore.addProject] Added project "${newProject.name}" with id "${newProject.id}". Current project count: ${this.projects.length}.`);
        await this.saveData();
        return newProject;
    }

    async getAllProjects() {
        return [...this.projects];
    }

    async findProjectById(projectId) {
        console.log(`[FlatFileStore.findProjectById] Searching for projectId: "${projectId}"`);
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            console.log(`[FlatFileStore.findProjectById] Found project with id: "${projectId}"`);
        } else {
            console.log(`[FlatFileStore.findProjectById] Project NOT FOUND with id: "${projectId}".`);
        }
        return project;
    }

    async updateProjectById(projectId, updateData) {
        const project = await this.findProjectById(projectId); // Use await if findProjectById becomes async
        if (project) {
            project.name = updateData.name !== undefined ? updateData.name : project.name;
            project.description = updateData.description !== undefined ? updateData.description : project.description;
            if (updateData.facebookUserAccessToken !== undefined) project.facebookUserAccessToken = updateData.facebookUserAccessToken;
            if (updateData.facebookUserID !== undefined) project.facebookUserID = updateData.facebookUserID;
            if (updateData.facebookSelectedPageID !== undefined) project.facebookSelectedPageID = updateData.facebookSelectedPageID;
            if (updateData.facebookPageName !== undefined) project.facebookPageName = updateData.facebookPageName;
            if (updateData.facebookPageAccessToken !== undefined) project.facebookPageAccessToken = updateData.facebookPageAccessToken;
            if (updateData.facebookPermissions !== undefined) project.facebookPermissions = updateData.facebookPermissions;
            if (updateData.tiktokAccessToken !== undefined) project.tiktokAccessToken = updateData.tiktokAccessToken;
            if (updateData.tiktokUserID !== undefined) project.tiktokUserID = updateData.tiktokUserID;
            if (updateData.tiktokPermissions !== undefined) project.tiktokPermissions = updateData.tiktokPermissions;
            if (updateData.linkedinAccessToken !== undefined) project.linkedinAccessToken = updateData.linkedinAccessToken;
            if (updateData.linkedinUserID !== undefined) project.linkedinUserID = updateData.linkedinUserID;
            if (updateData.linkedinUserFirstName !== undefined) project.linkedinUserFirstName = updateData.linkedinUserFirstName;
            if (updateData.linkedinUserLastName !== undefined) project.linkedinUserLastName = updateData.linkedinUserLastName;
            if (updateData.linkedinUserEmail !== undefined) project.linkedinUserEmail = updateData.linkedinUserEmail;
            if (updateData.linkedinPermissions !== undefined) project.linkedinPermissions = updateData.linkedinPermissions;
            if (updateData.googleDriveFolderId !== undefined) project.googleDriveFolderId = updateData.googleDriveFolderId;
            if (updateData.googleDriveAccessToken !== undefined) project.googleDriveAccessToken = updateData.googleDriveAccessToken;
            if (updateData.googleDriveRefreshToken !== undefined) project.googleDriveRefreshToken = updateData.googleDriveRefreshToken;
            if (updateData.assets !== undefined) project.assets = updateData.assets;
            if (updateData.wordpressUrl !== undefined) project.wordpressUrl = updateData.wordpressUrl;
            if (updateData.wordpressUsername !== undefined) project.wordpressUsername = updateData.wordpressUsername;
            if (updateData.wordpressApplicationPassword !== undefined) project.wordpressApplicationPassword = updateData.wordpressApplicationPassword;
            project.updatedAt = new Date();
            await this.saveData();
            return project;
        }
        return null;
    }

    async deleteProjectById(projectId) {
        const index = this.projects.findIndex(p => p.id === projectId);
        if (index !== -1) {
            this.projects.splice(index, 1);
            const projectObjectives = this.objectives.filter(o => o.projectId === projectId);
            for (const o of projectObjectives) { // ensure await inside loop works correctly
                await this.deleteObjectiveById(o.id); // This will call saveData
            }
            // Potentially save again here if deleteObjectiveById doesn't always save or if an error occurs in loop
            await this.saveData();
            return true;
        }
        return false;
    }

    async addObjective(objectiveData, projectId) {
        console.log(`[FlatFileStore.addObjective] Attempting to add objective for projectId: "${projectId}"`);
        const project = await this.findProjectById(projectId);
        if (!project) {
            console.error(`[FlatFileStore.addObjective] Prerequisite project check failed for projectId: "${projectId}". Objective not added.`);
            return null;
        }
        const title = String(objectiveData.title || '');
        const brief = String(objectiveData.brief || '');
        const newObjective = new Objective(projectId, title, brief);

        if (typeof newObjective !== 'object' || newObjective === null || !newObjective.hasOwnProperty('id') || !newObjective.hasOwnProperty('title')) {
            console.error('CRITICAL: newObjective is not a valid Objective instance right after construction!');
            return null;
        }

        if (objectiveData.plan) {
            newObjective.plan = { ...newObjective.plan, ...objectiveData.plan };
        }

        this.objectives.push(newObjective);
        await this.saveData();
        return newObjective;
    }

    async getObjectivesByProjectId(projectId) {
        return this.objectives.filter(o => o.projectId === projectId);
    }

    async getAllObjectives() {
        return [...this.objectives];
    }

    async findObjectiveById(objectiveId) {
        return this.objectives.find(o => o.id === objectiveId);
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        const objectiveToUpdate = await this.findObjectiveById(objectiveId);
        if (objectiveToUpdate) {
            for (const key in objectiveData) {
                if (objectiveData.hasOwnProperty(key)) {
                    if (key !== 'id' && key !== 'projectId') {
                        objectiveToUpdate[key] = objectiveData[key];
                    }
                }
            }
            objectiveToUpdate.updatedAt = new Date();
            await this.saveData();
            return objectiveToUpdate;
        }
        return null;
    }

    async deleteObjectiveById(objectiveId) {
        const index = this.objectives.findIndex(o => o.id === objectiveId);
        if (index !== -1) {
            this.objectives.splice(index, 1);
            await this.saveData();
            return true;
        }
        return false;
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        const objective = await this.findObjectiveById(objectiveId);
        if (objective) {
            const message = {
                speaker: sender,
                content: text,
                timestamp: new Date()
            };
            objective.chatHistory.push(message);
            objective.updatedAt = new Date();
            await this.saveData();
            return message;
        }
        return null;
    }
}

module.exports = FlatFileStore;
