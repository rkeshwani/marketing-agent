// src/models/Project.js
class Project {
    constructor(name, description = '') {
        this.id = `project_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.name = name;
        this.description = description;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }
}

module.exports = Project;
