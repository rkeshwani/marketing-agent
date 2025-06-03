// tests/services/geminiService.test.js
const geminiService = require('../../src/services/geminiService');
const Objective = require('../../src/models/Objective'); // To create objective instances

// Mock the actual Gemini API client or fetch/axios calls if they were directly used in geminiService.
// For this test, we'll assume geminiService.fetchGeminiResponse is the lowest level to mock for plan generation.
jest.mock('../../src/services/geminiService', () => {
    const originalModule = jest.requireActual('../../src/services/geminiService');
    return {
        ...originalModule, // Import and retain original functions
        fetchGeminiResponse: jest.fn(), // Mock fetchGeminiResponse specifically for most tests
    };
});

describe('GeminiService', () => {
    describe('generatePlanForObjective', () => {
        let mockObjective;
        const projectAssets = [{ name: 'Asset1', type: 'image', tags: ['tag1'] }];

        beforeEach(() => {
            // Reset mocks and objective before each test
            geminiService.fetchGeminiResponse.mockReset();
            // Default mock response for fetchGeminiResponse when called by generatePlanForObjective
            geminiService.fetchGeminiResponse.mockResolvedValue(`
PLAN:
- Step 1: Default mock step. [API: No, Content: Yes]
QUESTIONS:
- Default mock question?
            `.trim());

            mockObjective = new Objective('proj1', 'Test Objective', 'Initial brief');
        });

        test('should include previousPostSummary in prompt if context exists', async () => {
            mockObjective.currentRecurrenceContext = { previousPostSummary: 'Last time we did X.' };
            mockObjective.isRecurring = true; // Important for context to be used

            await geminiService.generatePlanForObjective(mockObjective, projectAssets);

            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledTimes(1);
            const promptArg = geminiService.fetchGeminiResponse.mock.calls[0][0];

            expect(promptArg).toContain('Contextual Brief: "This is a recurring task. The summary of the last completed instance was: "Last time we did X."');
            expect(promptArg).toContain('The overall objective is: "Initial brief".');
            expect(promptArg).toContain('Please generate a detailed, actionable plan for the *next* instance');
            expect(promptArg).toContain('AVAILABLE_ASSETS:\n- Asset1 (Type: image, Tags: tag1)');
        });

        test('should use specific prompt for first run of a recurring task (no originalPlan)', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = null; // Explicitly null for this test case

            await geminiService.generatePlanForObjective(mockObjective, projectAssets);

            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledTimes(1);
            const promptArg = geminiService.fetchGeminiResponse.mock.calls[0][0];

            expect(promptArg).toContain('Contextual Brief: "This is the first time setting up a recurring task. The overall objective is: "Initial brief".');
            expect(promptArg).toContain('Please generate a detailed, actionable plan that can serve as a template for future recurrences.');
        });

        test('should use standard prompt for non-recurring objectives', async () => {
            mockObjective.isRecurring = false;

            await geminiService.generatePlanForObjective(mockObjective, projectAssets);

            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledTimes(1);
            const promptArg = geminiService.fetchGeminiResponse.mock.calls[0][0];
            expect(promptArg).toContain('Contextual Brief: "Generate a detailed, actionable plan for the objective: "Initial brief"."');
        });

        test('should use standard prompt if recurring but no context and originalPlan exists (e.g. manual re-run or edge case)', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = { steps: ['some step'], questions: [] }; // originalPlan exists
            mockObjective.currentRecurrenceContext = null; // No context

            await geminiService.generatePlanForObjective(mockObjective, projectAssets);

            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledTimes(1);
            const promptArg = geminiService.fetchGeminiResponse.mock.calls[0][0];
            // This will fall into the final 'else' in the prompt generation logic
            expect(promptArg).toContain('Contextual Brief: "Generate a detailed, actionable plan for the objective: "Initial brief"."');
        });

        test('should parse plan steps and questions correctly', async () => {
            geminiService.fetchGeminiResponse.mockResolvedValue(`
PLAN:
- Step 1: Do X. [API: Yes, Content: No]
- Step 2: Analyze Y. [API: No, Content: Yes]
QUESTIONS:
- What is Z?
- How about W?
            `.trim());

            const { planSteps, questions } = await geminiService.generatePlanForObjective(mockObjective, []);

            expect(planSteps).toEqual(['Do X.', 'Analyze Y.']);
            expect(questions).toEqual(['What is Z?', 'How about W?']);
        });

        test('should handle "QUESTIONS: None" correctly', async () => {
            geminiService.fetchGeminiResponse.mockResolvedValue(`
PLAN:
- Step 1: Just do it. [API: No, Content: Yes]
QUESTIONS: None
            `.trim());

            const { planSteps, questions } = await geminiService.generatePlanForObjective(mockObjective, []);

            expect(planSteps).toEqual(['Just do it.']);
            expect(questions).toEqual([]);
        });
    });

    // Add more describe blocks for other geminiService functions if needed, e.g., executePlanStep
});
