const assert = require('node:assert');
const agent = require('../src/agent'); // Assuming agent.js can access mockDataStore (see note below)
const geminiService = require('../src/services/geminiService');

// NOTE: This test suite assumes that agent.js can be made to use the mockDataStore defined herein.
// For true unit testing, agent.js would need to support dependency injection for dataStore
// or a mocking framework like proxyquire/jest would be used to properly mock '../src/dataStore'.

// --- Test Suite for Agent ---

console.log('Running tests for src/agent.js...');

// Mock services and data store
let mockObjective;
let mockDataStore; // This will be the mock, agent.js needs to somehow use this.
let originalFetchGeminiResponse;
let originalGeneratePlanForObjective;
let originalExecutePlanStep;

function setup() {
    // Initialize mockObjective
    mockObjective = {
        id: 'test-objective-123',
        title: 'Test Objective',
        brief: 'A test objective.',
        projectId: 'test-project-456',
        plan: {
            steps: ['Step 1: Do A', 'Step 2: Do B'],
            status: 'approved', // Default for execution tests
            questions: [],
            currentStepIndex: 0 // Default for execution tests
        },
        chatHistory: []
    };

    // Initialize mockDataStore
    // agent.js will call methods on 'dataStore'. For these tests to work without modifying agent.js
    // to accept dataStore via DI, we'd typically use jest.mock() or proxyquire.
    // Here, we define mockDataStore and agent.js is expected to use it.
    // This is a conceptual setup for the purpose of this exercise.
    // In a real scenario, you would ensure agent.js uses this mock.
    global.dataStore = { // Attempting to make it globally available for agent.js
        findObjectiveById: (objectiveId) => {
            if (objectiveId === mockObjective.id) return mockObjective;
            return null;
        },
        updateObjectiveById: (objectiveId, title, brief, plan, chatHistory) => {
            if (objectiveId === mockObjective.id) {
                mockObjective.title = title;
                mockObjective.brief = brief;
                mockObjective.plan = plan;
                mockObjective.chatHistory = chatHistory;
                return mockObjective;
            }
            return null;
        },
        findProjectById: (projectId) => { // Added based on agent.js usage
            if (projectId === mockObjective.projectId) {
                return { id: mockObjective.projectId, name: 'Test Project', assets: [] };
            }
            return null;
        }
    };


    // Store original geminiService functions
    originalFetchGeminiResponse = geminiService.fetchGeminiResponse;
    originalGeneratePlanForObjective = geminiService.generatePlanForObjective;
    originalExecutePlanStep = geminiService.executePlanStep;

    // Override geminiService functions with mocks
    geminiService.fetchGeminiResponse = async (userInput, chatHistory, projectAssets) => {
        console.log(`Mocked geminiService.fetchGeminiResponse called with: "${userInput}"`);
        if (userInput === "error_test") {
            throw new Error("Simulated service error");
        }
        return `Mocked conversational response to: ${userInput}`;
    };

    geminiService.generatePlanForObjective = async (objective, projectAssets) => {
        console.log(`Mocked geminiService.generatePlanForObjective called for objective: "${objective.title}"`);
        return { planSteps: ['Generated Step 1', 'Generated Step 2'], questions: ['Q1?'] };
    };

    geminiService.executePlanStep = async (stepDescription, chatHistory, projectAssets) => {
        console.log(`Mocked geminiService.executePlanStep called for step: "${stepDescription}"`);
        return `Executed: ${stepDescription}`;
    };

    console.log('Mocks setup complete.');
}

function teardown() {
    // Restore original geminiService functions
    geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
    geminiService.generatePlanForObjective = originalGeneratePlanForObjective;
    geminiService.executePlanStep = originalExecutePlanStep;

    // Reset mocks
    mockObjective = null;
    // delete global.dataStore; // Clean up global mock
    global.dataStore = undefined; // More robust way to remove
    console.log('Mocks torn down.');
}

// --- Existing Tests (Adapted) ---
async function testAgentReturnsServiceResponseForConversation() {
    console.log('Test: agent should return service response for general conversation...');
    setup();
    // Ensure plan is 'completed' or 'approved' but currentStepIndex is beyond steps length
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = mockObjective.plan.steps.length; // All steps done

    const userInput = "Hello, agent!";
    const chatHistory = []; // Assuming chat history is managed elsewhere or not critical for this basic test
    const response = await agent.getAgentResponse(userInput, chatHistory, mockObjective.id);
    assert.strictEqual(response, "Mocked conversational response to: Hello, agent!", "Test Failed: Agent did not return the correct conversational response.");
    console.log('Test Passed: Agent returned conversational service response.');
    teardown();
}

async function testAgentHandlesServiceErrorInConversation() {
    console.log('Test: agent should handle service error gracefully during conversation...');
    setup();
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = mockObjective.plan.steps.length; // All steps done

    const userInput = "error_test"; // This input triggers simulated error in mock fetchGeminiResponse
    const chatHistory = [];
    const response = await agent.getAgentResponse(userInput, chatHistory, mockObjective.id);
    assert.strictEqual(response, "Agent: I'm sorry, I encountered an error trying to get a response.", "Test Failed: Agent did not handle conversational error correctly.");
    console.log('Test Passed: Agent handled conversational service error.');
    teardown();
}


// --- New Test Functions for Plan Execution ---

async function testPlanExecutionFlow() {
    console.log('Test: testPlanExecutionFlow...');
    setup();
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = 0;
    mockObjective.plan.steps = ['Step A', 'Step B'];

    // First call (execute Step A)
    const response1 = await agent.getAgentResponse('User input for step A', [], mockObjective.id);
    assert.deepStrictEqual(response1, { message: 'Executed: Step A', currentStep: 0, stepDescription: 'Step A', planStatus: 'in_progress' }, 'Test Failed: Step 1 response incorrect');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex not updated after step 1');
    assert.strictEqual(mockObjective.plan.status, 'in_progress', 'Test Failed: Plan status not in_progress after step 1');


    // Second call (execute Step B)
    const response2 = await agent.getAgentResponse('User input for step B', [], mockObjective.id);
    assert.deepStrictEqual(response2, { message: 'Executed: Step B', currentStep: 1, stepDescription: 'Step B', planStatus: 'in_progress' }, 'Test Failed: Step 2 response incorrect');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 2, 'Test Failed: currentStepIndex not updated after step 2');

    // Third call (completion)
    const response3 = await agent.getAgentResponse('User input after steps', [], mockObjective.id);
    assert.deepStrictEqual(response3, { message: 'All plan steps completed!', planStatus: 'completed' }, 'Test Failed: Plan completion response incorrect');
    assert.strictEqual(mockObjective.plan.status, 'completed', 'Test Failed: Plan status not set to completed');
    console.log('Test Passed: testPlanExecutionFlow.');
    teardown();
}

async function testPlanStartsExecutionFromCorrectIndex() {
    console.log('Test: testPlanStartsExecutionFromCorrectIndex...');
    setup();
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = 1; // Start from the second step (index 1)
    mockObjective.plan.steps = ['Step X', 'Step Y', 'Step Z'];

    const response = await agent.getAgentResponse('User input', [], mockObjective.id);
    assert.deepStrictEqual(response, { message: 'Executed: Step Y', currentStep: 1, stepDescription: 'Step Y', planStatus: 'in_progress' }, 'Test Failed: Did not start from correct index');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 2, 'Test Failed: currentStepIndex not updated correctly when starting mid-plan');
    console.log('Test Passed: testPlanStartsExecutionFromCorrectIndex.');
    teardown();
}

async function testPlanAlreadyCompletedReturnsAppropriateMessage() {
    console.log('Test: testPlanAlreadyCompletedReturnsAppropriateMessage...');
    setup();
    mockObjective.plan.status = 'completed';
    mockObjective.plan.steps = ['Step A', 'Step B'];
    mockObjective.plan.currentStepIndex = 2; // Already past all steps

    // This call should now go to the conversational fallback because status is 'completed'
    // and the plan execution logic for 'completed' status returns the "All plan steps completed!" message.
    const response = await agent.getAgentResponse('User input for completed plan', [], mockObjective.id);

    // The agent.js logic for a 'completed' plan is to return the "All plan steps completed!" message directly.
    // If it were to fall through to conversational, the mock would return "Mocked conversational response to: User input for completed plan"
    assert.deepStrictEqual(response, { message: 'All plan steps completed!', planStatus: 'completed' }, 'Test Failed: Response for already completed plan incorrect.');
    console.log('Test Passed: testPlanAlreadyCompletedReturnsAppropriateMessage.');
    teardown();
}

async function testPlanNotApprovedReturnsApprovalMessage() {
    console.log('Test: testPlanNotApprovedReturnsApprovalMessage...');
    setup();
    mockObjective.plan.status = 'pending_approval';

    const response = await agent.getAgentResponse('User input for pending plan', [], mockObjective.id);
    assert.strictEqual(response, "It looks like there's a plan that needs your attention. Please approve the current plan before we proceed with this objective.", "Test Failed: Response for unapproved plan incorrect.");
    console.log('Test Passed: testPlanNotApprovedReturnsApprovalMessage.');
    teardown();
}


// Run tests
async function runTests() {
  try {
    await testAgentReturnsServiceResponseForConversation();
    await testAgentHandlesServiceErrorInConversation();
    await testPlanExecutionFlow();
    await testPlanStartsExecutionFromCorrectIndex();
    await testPlanAlreadyCompletedReturnsAppropriateMessage();
    await testPlanNotApprovedReturnsApprovalMessage();
    console.log('All agent tests passed!');
  } catch (error) {
    console.error('Agent Test Suite Failed:', error.message, error.stack);
    process.exitCode = 1; // Indicate failure
  }
}

// If this file is run directly, execute the tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests }; // Export for potential use with a test runner
