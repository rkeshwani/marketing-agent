// src/services/schedulerService.js

class SchedulerService {
    constructor(dataStore) {
        this.dataStore = dataStore;
        if (!this.dataStore) {
            throw new Error("SchedulerService requires a dataStore instance.");
        }
    }

    /**
     * Checks for objectives that are scheduled to run, updates their status,
     * and prepares them for execution.
     */
    checkScheduledTasks() {
        console.log('SchedulerService: Checking for scheduled tasks...');
        const now = new Date();
        const objectives = this.dataStore.getAllObjectives(); // Assuming dataStore has this method

        if (!objectives || objectives.length === 0) {
            console.log('SchedulerService: No objectives found.');
            return;
        }

        const triggeredObjectives = [];

        for (const objective of objectives) {
            if (
                objective.isRecurring &&
                objective.plan &&
                objective.plan.status === 'pending_scheduling' &&
                objective.nextRunTime &&
                new Date(objective.nextRunTime) <= now
            ) {
                console.log(`SchedulerService: Triggering recurring objective ID: ${objective.id} scheduled for ${objective.nextRunTime}`);

                // Update objective for the new run
                objective.plan.status = 'approved'; // Assuming recurrences don't need re-approval
                objective.plan.currentStepIndex = 0;

                // objective.currentRecurrenceContext is already set from the previous completion.
                // The agent/geminiService will need to be aware of this context when it starts executing the plan.

                const originalNextRunTime = objective.nextRunTime; // Keep for logging or context if needed
                objective.nextRunTime = null; // Clear it to indicate it's now active and not pending for this specific time

                // Save the updated objective
                this.dataStore.updateObjective(objective); // Assuming this method updates the entire object

                triggeredObjectives.push({
                    id: objective.id,
                    title: objective.title,
                    triggeredAt: new Date().toISOString(),
                    originallyScheduledFor: originalNextRunTime
                });

                console.log(`SchedulerService: Objective ID: ${objective.id} ('${objective.title}') status set to 'approved' and ready for execution.`);
            }
        }

        if (triggeredObjectives.length > 0) {
            console.log(`SchedulerService: ${triggeredObjectives.length} objective(s) were triggered:`, triggeredObjectives);
        } else {
            console.log('SchedulerService: No objectives due for scheduled run at this time.');
        }
    }
}

module.exports = SchedulerService;
