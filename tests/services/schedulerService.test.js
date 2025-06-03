// tests/services/schedulerService.test.js
const SchedulerService = require('../../src/services/schedulerService');
const Objective = require('../../src/models/Objective'); // Assuming Objective model might be useful for creating test data

describe('SchedulerService', () => {
    let mockDataStore;
    let schedulerService;

    beforeEach(() => {
        // Reset mockDataStore for each test
        mockDataStore = {
            getAllObjectives: jest.fn(),
            updateObjective: jest.fn((objective) => objective), // Return the objective for chaining or verification
        };
        schedulerService = new SchedulerService(mockDataStore);
    });

    test('constructor should throw error if dataStore is not provided', () => {
        expect(() => new SchedulerService()).toThrow("SchedulerService requires a dataStore instance.");
    });

    test('checkScheduledTasks should not trigger objectives if none are due', () => {
        const futureTime = new Date(Date.now() + 3600 * 1000); // 1 hour in the future
        const objectives = [
            { id: 'obj1', isRecurring: false, plan: { status: 'pending_scheduling' }, nextRunTime: new Date() },
            { id: 'obj2', isRecurring: true, plan: { status: 'approved' }, nextRunTime: new Date() },
            { id: 'obj3', isRecurring: true, plan: { status: 'pending_scheduling' }, nextRunTime: futureTime },
            { id: 'obj4', isRecurring: true, plan: { status: 'pending_scheduling' }, nextRunTime: null },
        ];
        mockDataStore.getAllObjectives.mockReturnValue(objectives);

        schedulerService.checkScheduledTasks();

        expect(mockDataStore.getAllObjectives).toHaveBeenCalledTimes(1);
        expect(mockDataStore.updateObjective).not.toHaveBeenCalled();
    });

    test('checkScheduledTasks should trigger due recurring objectives', () => {
        const now = new Date();
        const pastTime = new Date(Date.now() - 1000); // 1 second in the past
        const objectives = [
            {
                id: 'dueObj1',
                title: 'Due Objective 1',
                isRecurring: true,
                plan: { status: 'pending_scheduling', currentStepIndex: 5 }, // currentStepIndex should be reset
                nextRunTime: pastTime,
                currentRecurrenceContext: { previousPostSummary: 'Test' } // Should remain
            },
            {
                id: 'dueObj2',
                title: 'Due Objective 2',
                isRecurring: true,
                plan: { status: 'pending_scheduling', currentStepIndex: 1 },
                nextRunTime: new Date(now.getTime() - 5000) // 5 seconds ago
            },
            {
                id: 'notDueObj',
                isRecurring: true,
                plan: { status: 'pending_scheduling' },
                nextRunTime: new Date(now.getTime() + 3600 * 1000) // 1 hour from now
            },
             {
                id: 'notRecurringObj',
                isRecurring: false,
                plan: { status: 'pending_scheduling' },
                nextRunTime: pastTime
            },
        ];
        mockDataStore.getAllObjectives.mockReturnValue(objectives);

        schedulerService.checkScheduledTasks();

        expect(mockDataStore.getAllObjectives).toHaveBeenCalledTimes(1);
        expect(mockDataStore.updateObjective).toHaveBeenCalledTimes(2);

        // Check details for dueObj1
        const updatedObj1 = mockDataStore.updateObjective.mock.calls.find(call => call[0].id === 'dueObj1')[0];
        expect(updatedObj1.plan.status).toBe('approved');
        expect(updatedObj1.plan.currentStepIndex).toBe(0);
        expect(updatedObj1.nextRunTime).toBeNull();
        expect(updatedObj1.currentRecurrenceContext).toEqual({ previousPostSummary: 'Test' }); // Context should persist

        // Check details for dueObj2
        const updatedObj2 = mockDataStore.updateObjective.mock.calls.find(call => call[0].id === 'dueObj2')[0];
        expect(updatedObj2.plan.status).toBe('approved');
        expect(updatedObj2.plan.currentStepIndex).toBe(0);
        expect(updatedObj2.nextRunTime).toBeNull();
    });

    test('checkScheduledTasks should handle empty objectives list', () => {
        mockDataStore.getAllObjectives.mockReturnValue([]);
        schedulerService.checkScheduledTasks();
        expect(mockDataStore.updateObjective).not.toHaveBeenCalled();
    });

    test('checkScheduledTasks should handle objectives without a plan property', () => {
        const objectives = [
            { id: 'obj1', isRecurring: true, nextRunTime: new Date(Date.now() - 1000) }, // No plan
        ];
        mockDataStore.getAllObjectives.mockReturnValue(objectives);
        schedulerService.checkScheduledTasks();
        expect(mockDataStore.updateObjective).not.toHaveBeenCalled();
    });
});
