// src/interfaces/DataStoreInterface.js

class DataStoreInterface {
    constructor() {
        if (this.constructor === DataStoreInterface) {
            throw new Error("Cannot instantiate abstract class DataStoreInterface directly.");
        }
    }

    async loadData() {
        throw new Error("Method 'loadData()' must be implemented.");
    }

    async saveData() {
        throw new Error("Method 'saveData()' must be implemented.");
    }

    async addProject(projectData) {
        throw new Error("Method 'addProject(projectData)' must be implemented.");
    }

    async getAllProjects() {
        throw new Error("Method 'getAllProjects()' must be implemented.");
    }

    async findProjectById(projectId) {
        throw new Error("Method 'findProjectById(projectId)' must be implemented.");
    }

    async updateProjectById(projectId, updateData) {
        throw new Error("Method 'updateProjectById(projectId, updateData)' must be implemented.");
    }

    async deleteProjectById(projectId) {
        throw new Error("Method 'deleteProjectById(projectId)' must be implemented.");
    }

    async addObjective(objectiveData, projectId) {
        throw new Error("Method 'addObjective(objectiveData, projectId)' must be implemented.");
    }

    async getObjectivesByProjectId(projectId) {
        throw new Error("Method 'getObjectivesByProjectId(projectId)' must be implemented.");
    }

    async getAllObjectives() {
        throw new Error("Method 'getAllObjectives()' must be implemented.");
    }

    async findObjectiveById(objectiveId) {
        throw new Error("Method 'findObjectiveById(objectiveId)' must be implemented.");
    }

    async updateObjectiveById(objectiveId, objectiveData) {
        throw new Error("Method 'updateObjectiveById(objectiveId, objectiveData)' must be implemented.");
    }

    async deleteObjectiveById(objectiveId) {
        throw new Error("Method 'deleteObjectiveById(objectiveId)' must be implemented.");
    }

    async addMessageToObjectiveChat(objectiveId, sender, text) {
        throw new Error("Method 'addMessageToObjectiveChat(objectiveId, sender, text)' must be implemented.");
    }
}

module.exports = DataStoreInterface;
