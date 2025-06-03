// src/models/Project.js
class Project {
    constructor(name, description = '') {
        this.id = `project_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.name = name;
        this.description = description;
        this.createdAt = new Date();
        this.updatedAt = new Date();

        // Facebook fields
        this.facebookUserAccessToken = null;
        this.facebookUserID = null;
        this.facebookSelectedPageID = null;
        this.facebookPageName = null; // Added for storing the selected page's name
        this.facebookPageAccessToken = null;
        this.facebookPermissions = [];

        // TikTok fields
        this.tiktokAccessToken = null;
        this.tiktokUserID = null;
        this.tiktokPermissions = [];
    }
}

module.exports = Project;
