// tests/models/Objective.test.js
const Objective = require('../../src/models/Objective');

describe('Objective Model', () => {
    let objective;
    const projectId = 'project_123';
    const title = 'Test Objective';
    const brief = 'This is a test objective.';

    beforeEach(() => {
        objective = new Objective(projectId, title, brief);
    });

    test('constructor should initialize basic properties correctly', () => {
        expect(objective.id).toBeDefined();
        expect(objective.projectId).toBe(projectId);
        expect(objective.title).toBe(title);
        expect(objective.brief).toBe(brief);
        expect(objective.plan).toEqual({
            steps: [],
            status: 'pending_approval',
            questions: [],
            currentStepIndex: 0,
        });
        expect(objective.chatHistory).toEqual([]);
        expect(objective.createdAt).toBeInstanceOf(Date);
        expect(objective.updatedAt).toBeInstanceOf(Date);
    });

    test('constructor should initialize recurrence properties to defaults', () => {
        expect(objective.isRecurring).toBe(false);
        expect(objective.recurrenceRule).toBeNull();
        expect(objective.nextRunTime).toBeNull();
        expect(objective.originalPlan).toBeNull();
        expect(objective.currentRecurrenceContext).toBeNull();
    });

    test('should allow setting and getting isRecurring', () => {
        objective.isRecurring = true;
        expect(objective.isRecurring).toBe(true);
        objective.isRecurring = false;
        expect(objective.isRecurring).toBe(false);
    });

    test('should allow setting and getting recurrenceRule', () => {
        const rule = { frequency: 'daily', interval: 1 };
        objective.recurrenceRule = rule;
        expect(objective.recurrenceRule).toEqual(rule);
        objective.recurrenceRule = null;
        expect(objective.recurrenceRule).toBeNull();
    });

    test('should allow setting and getting nextRunTime', () => {
        const time = new Date();
        objective.nextRunTime = time;
        expect(objective.nextRunTime).toEqual(time);
        objective.nextRunTime = null;
        expect(objective.nextRunTime).toBeNull();
    });

    test('should allow setting and getting originalPlan', () => {
        const plan = { steps: ['Step 1'], questions: ['Q1?'] };
        objective.originalPlan = plan;
        expect(objective.originalPlan).toEqual(plan);
        objective.originalPlan = null;
        expect(objective.originalPlan).toBeNull();
    });

    test('should allow setting and getting currentRecurrenceContext', () => {
        const context = { previousPostSummary: 'Summary A' };
        objective.currentRecurrenceContext = context;
        expect(objective.currentRecurrenceContext).toEqual(context);
        objective.currentRecurrenceContext = null;
        expect(objective.currentRecurrenceContext).toBeNull();
    });
});
