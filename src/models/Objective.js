// src/models/Objective.js
class Objective {
    constructor(projectId, title, brief = '') {
        this.id = `objective_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        this.projectId = projectId;
        this.title = title;
        this.brief = brief;
        this.plan = {
            steps: [],
            status: 'pending_approval',
            questions: [],
            currentStepIndex: 0,
        };
        this.chatHistory = []; // Initialize with an empty array
        this.createdAt = new Date();
        this.updatedAt = new Date();

        // Recurrence properties
        this.isRecurring = false;
        this.recurrenceRule = null;
        this.nextRunTime = null;
        this.originalPlan = null;
        this.currentRecurrenceContext = null;
    }
}

module.exports = Objective;
