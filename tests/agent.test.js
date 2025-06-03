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
let mockDataStore;
let originalFetchGeminiResponse;
let originalGeneratePlanForObjective;
let originalExecutePlanStep;
let mockExecutePlanStepResponse; // Used to control executePlanStep mock behavior per test

function setup() {
    mockObjective = {
        id: 'test-objective-123',
        title: 'Test Objective',
        brief: 'A test objective.',
        projectId: 'test-project-456', // Ensure projectId is present
        plan: {
            steps: ['Step 1: Do A', 'Step 2: Do B'],
            status: 'approved',
            questions: [],
            currentStepIndex: 0
        },
        chatHistory: [],
        assets: [] // Initialize assets for tools that modify them
    };

    // Reset mock response for executePlanStep for each test
    mockExecutePlanStepResponse = 'Default step response from mockExecutePlanStep';

    global.dataStore = {
        findObjectiveById: (objectiveId) => {
            if (objectiveId === mockObjective.id) return mockObjective;
            return null;
        },
        updateObjectiveById: (objectiveId, title, brief, plan, chatHistory) => {
            if (objectiveId === mockObjective.id) {
                mockObjective.title = title !== undefined ? title : mockObjective.title;
                mockObjective.brief = brief !== undefined ? brief : mockObjective.brief;
                mockObjective.plan = plan !== undefined ? plan : mockObjective.plan;
                mockObjective.chatHistory = chatHistory !== undefined ? chatHistory : mockObjective.chatHistory;
                return mockObjective;
            }
            return null;
        },
        findProjectById: (projectId) => {
            if (projectId === mockObjective.projectId) {
                // Return a project structure that includes the shared assets array
                return {
                    id: mockObjective.projectId,
                    name: 'Test Project',
                    assets: mockObjective.assets // Crucial: use the assets from mockObjective
                };
            }
            return null;
        },
        updateProjectById: (projectId, updateData) => {
            if (projectId === mockObjective.projectId) {
                if (updateData.assets !== undefined) {
                    mockObjective.assets = updateData.assets; // Directly update mockObjective's assets
                }
                // Add other fields to update if necessary for other tests
                return { ...mockObjective, ...updateData }; // Return a conceptual updated project
            }
            return null;
        }
    };

    originalFetchGeminiResponse = geminiService.fetchGeminiResponse;
    originalGeneratePlanForObjective = geminiService.generatePlanForObjective;
    originalExecutePlanStep = geminiService.executePlanStep;

    geminiService.fetchGeminiResponse = async (userInput, chatHistory, projectAssets) => {
        console.log(`Mocked geminiService.fetchGeminiResponse called with: "${userInput}"`);
        if (userInput === "error_test") {
            throw new Error("Simulated service error");
        }
        if (userInput.startsWith('The tool')) { // For summarizing tool output
            return `Gemini summary based on tool output: ${userInput.substring(0, 200)}...`;
        }
        return `Mocked conversational response to: ${userInput}`;
    };

    geminiService.generatePlanForObjective = async (objective, projectAssets) => {
        return { planSteps: ['Generated Step 1', 'Generated Step 2'], questions: ['Q1?'] };
    };

    geminiService.executePlanStep = async (stepDescription, chatHistory, projectAssets) => {
        console.log(`Mocked geminiService.executePlanStep called for step: "${stepDescription}", will return:`, mockExecutePlanStepResponse);
        return mockExecutePlanStepResponse; // Use the configurable mock response
    };

    console.log('Mocks setup complete.');
}

function teardown() {
    geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
    geminiService.generatePlanForObjective = originalGeneratePlanForObjective;
    geminiService.executePlanStep = originalExecutePlanStep;
    mockObjective = null;
    global.dataStore = undefined;
    mockExecutePlanStepResponse = null; // Reset configurable response
    console.log('Mocks torn down.');
}

async function testAgentReturnsServiceResponseForConversation() {
    console.log('Test: agent should return service response for general conversation...');
    setup();
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = mockObjective.plan.steps.length;
    const userInput = "Hello, agent!";
    const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
    assert.strictEqual(response, "Mocked conversational response to: Hello, agent!", "Test Failed: Incorrect conversational response.");
    console.log('Test Passed: Agent returned conversational service response.');
    teardown();
}

async function testAgentHandlesServiceErrorInConversation() {
    console.log('Test: agent should handle service error gracefully during conversation...');
    setup();
    mockObjective.plan.status = 'approved';
    mockObjective.plan.currentStepIndex = mockObjective.plan.steps.length;
    const userInput = "error_test";
    const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
    assert.strictEqual(response, "Agent: I'm sorry, I encountered an error trying to get a response.", "Test Failed: Incorrect error handling in conversation.");
    console.log('Test Passed: Agent handled conversational service error.');
    teardown();
}

async function testPlanExecutionFlow_DirectResponses() {
    console.log('Test: testPlanExecutionFlow_DirectResponses (no tools)...');
    setup();
    mockObjective.plan = { steps: ['Step A', 'Step B'], status: 'approved', currentStepIndex: 0, questions: [] };

    mockExecutePlanStepResponse = 'Executed Step A directly.';
    const response1 = await agent.getAgentResponse('User input for step A', [], mockObjective.id);
    assert.deepStrictEqual(response1, { message: 'Executed Step A directly.', currentStep: 0, stepDescription: 'Step A', planStatus: 'in_progress' }, 'Test Failed: Step 1 direct response incorrect');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex not updated after step 1 (direct)');
    assert.strictEqual(mockObjective.chatHistory.length, 1, "Chat history length incorrect after step 1");
    assert.strictEqual(mockObjective.chatHistory[0].content, 'Executed Step A directly.', "Chat history content incorrect after step 1");


    mockExecutePlanStepResponse = 'Executed Step B directly.';
    const response2 = await agent.getAgentResponse('User input for step B', [], mockObjective.id);
    assert.deepStrictEqual(response2, { message: 'Executed Step B directly.', currentStep: 1, stepDescription: 'Step B', planStatus: 'in_progress' }, 'Test Failed: Step 2 direct response incorrect'); // This was planStatus: 'completed' before, fixed.
    assert.strictEqual(mockObjective.plan.currentStepIndex, 2, 'Test Failed: currentStepIndex not updated after step 2 (direct)');
    assert.strictEqual(mockObjective.plan.status, 'completed', 'Test Failed: Plan status not completed after step 2 (direct)');
    assert.strictEqual(mockObjective.chatHistory.length, 2, "Chat history length incorrect after step 2");
    assert.strictEqual(mockObjective.chatHistory[1].content, 'Executed Step B directly.', "Chat history content incorrect after step 2");


    const response3 = await agent.getAgentResponse('User input after steps', [], mockObjective.id);
    // The message for completion after the last step has specific format
    assert.deepStrictEqual(response3, { message: 'All plan steps completed! Last step result: Executed Step B directly.', currentStep: 1, stepDescription: 'Step B', planStatus: 'completed' }, 'Test Failed: Plan completion response incorrect (direct)');
    assert.strictEqual(mockObjective.plan.status, 'completed', 'Test Failed: Plan status not set to completed (direct)');
    console.log('Test Passed: testPlanExecutionFlow_DirectResponses.');
    teardown();
}

async function testPlanStartsExecutionFromCorrectIndex_DirectResponse() {
    console.log('Test: testPlanStartsExecutionFromCorrectIndex_DirectResponse...');
    setup();
    mockObjective.plan = { steps: ['Step X', 'Step Y', 'Step Z'], status: 'approved', currentStepIndex: 1, questions:[] };
    mockExecutePlanStepResponse = 'Executed Step Y directly.';
    const response = await agent.getAgentResponse('User input', [], mockObjective.id);
    assert.deepStrictEqual(response, { message: 'Executed Step Y directly.', currentStep: 1, stepDescription: 'Step Y', planStatus: 'in_progress' }, 'Test Failed: Did not start from correct index (direct)');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 2, 'Test Failed: currentStepIndex not updated correctly (direct)');
    console.log('Test Passed: testPlanStartsExecutionFromCorrectIndex_DirectResponse.');
    teardown();
}

async function testPlanAlreadyCompletedReturnsAppropriateMessage() {
    console.log('Test: testPlanAlreadyCompletedReturnsAppropriateMessage...');
    setup();
    mockObjective.plan.status = 'completed';
    mockObjective.plan.steps = ['Step A', 'Step B'];
    mockObjective.plan.currentStepIndex = 2;
    const response = await agent.getAgentResponse('User input for completed plan', [], mockObjective.id);
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

// --- New Tests for Tool Execution ---

async function testAgentExecutesSemanticSearchTool() {
    console.log('Test: Agent executes semantic_search_assets tool...');
    setup();
    mockObjective.plan = { steps: ['Search for dogs'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockObjective.assets = [ // Ensure assets are on mockObjective directly
        { assetId: '1', name: 'cat picture', description: 'a tabby cat', type: 'image' },
        { assetId: '2', name: 'dog park video', description: 'dogs playing fetch', type: 'video' }
    ];
    mockExecutePlanStepResponse = { tool_call: { name: "semantic_search_assets", arguments: { query: "dogs" } } };

    const response = await agent.getAgentResponse('User input for search', [], mockObjective.id);

    assert(response.message.startsWith("Gemini summary based on tool output:"), 'Test Failed: Response message should start with Gemini summary.');
    const expectedToolOutput = JSON.stringify([{ id: '2', name: 'dog park video', type: 'video', description: 'dogs playing fetch' }]);
    assert(response.message.includes(expectedToolOutput), `Test Failed: Response message should contain tool output. Got: ${response.message}`);
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex not updated after search tool.');
    assert.strictEqual(mockObjective.chatHistory.length, 2, 'Test Failed: Chat history length incorrect after search tool.');
    assert(mockObjective.chatHistory[0].content.includes('semantic_search_assets'), 'Test Failed: Chat history missing tool call system message.');
    assert(mockObjective.chatHistory[1].content.startsWith('Gemini summary based on tool output:'), 'Test Failed: Chat history missing Gemini summary.');
    console.log('Test Passed: Agent executes semantic_search_assets tool.');
    teardown();
}

async function testAgentExecutesCreateImageAssetTool() {
    console.log('Test: Agent executes create_image_asset tool...');
    setup();
    mockObjective.plan = { steps: ['Create image of a sunset'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockObjective.assets = []; // Start with no assets
    const promptForTool = "a beautiful sunset";
    mockExecutePlanStepResponse = { tool_call: { name: "create_image_asset", arguments: { prompt: promptForTool } } };

    const response = await agent.getAgentResponse('User input for image', [], mockObjective.id);

    assert(response.message.startsWith("Gemini summary based on tool output:"), 'Test Failed: Response message should start with Gemini summary for image tool.');
    assert.strictEqual(mockObjective.assets.length, 1, 'Test Failed: Number of assets should be 1 after image creation.');
    assert.strictEqual(mockObjective.assets[0].type, 'image', 'Test Failed: Asset type should be image.');
    assert.strictEqual(mockObjective.assets[0].prompt, promptForTool, 'Test Failed: Asset prompt does not match.');
    assert(mockObjective.assets[0].name.includes(promptForTool.substring(0,30)), 'Test Failed: Asset name does not match prompt.');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex not updated after image tool.');
    console.log('Test Passed: Agent executes create_image_asset tool.');
    teardown();
}

async function testAgentHandlesUnknownToolNameFromGemini() {
    console.log('Test: Agent handles unknown tool name from Gemini...');
    setup();
    mockObjective.plan = { steps: ['Use unknown tool'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = { tool_call: { name: "non_existent_tool", arguments: { param: "value" } } };

    const response = await agent.getAgentResponse('User input for unknown tool', [], mockObjective.id);

    assert(response.message.includes("Error: The agent tried to use an unknown tool: non_existent_tool"), 'Test Failed: Incorrect error message for unknown tool.');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex should increment even after unknown tool error.');
    // Check chat history for the error message
    assert(mockObjective.chatHistory.some(m => m.speaker === 'system' && m.content.includes('Error: Tool non_existent_tool not found.')), 'Test Failed: System error message not found in chat history for unknown tool.');
    console.log('Test Passed: Agent handles unknown tool name from Gemini.');
    teardown();
}

async function testStepCompletesDirectlyWithoutToolCall() {
    console.log('Test: Step completes directly without tool call...');
    setup();
    mockObjective.plan = { steps: ['A simple text step'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = 'This step was simple and completed directly by Gemini.';

    const response = await agent.getAgentResponse('User input for simple step', [], mockObjective.id);

    assert.strictEqual(response.message, 'This step was simple and completed directly by Gemini.', 'Test Failed: Incorrect message for direct completion.');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 1, 'Test Failed: currentStepIndex not updated for direct completion.');
    assert(mockObjective.chatHistory.some(m => m.speaker === 'agent' && m.content === mockExecutePlanStepResponse), 'Test Failed: Direct response not in chat history.');
    console.log('Test Passed: Step completes directly without tool call.');
    teardown();
}

// Run tests
async function runTests() {
  try {
    await testAgentReturnsServiceResponseForConversation();
    await testAgentHandlesServiceErrorInConversation();
    // Renamed old testPlanExecutionFlow to avoid confusion
    await testPlanExecutionFlow_DirectResponses();
    await testPlanStartsExecutionFromCorrectIndex_DirectResponse();
    await testPlanAlreadyCompletedReturnsAppropriateMessage();
    await testPlanNotApprovedReturnsApprovalMessage();

    // New tool execution tests
    await testAgentExecutesSemanticSearchTool();
    await testAgentExecutesCreateImageAssetTool();
    await testAgentHandlesUnknownToolNameFromGemini();
    await testStepCompletesDirectlyWithoutToolCall();

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
