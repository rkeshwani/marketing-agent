const assert = require('node:assert');
const expect = require('expect'); // Using expect for Jest-like assertions

// Mock 'node-fetch'
let mockFetchResponses = {};
jest.mock('node-fetch', () => jest.fn((url, options) => {
    if (mockFetchResponses[url]) {
        const mockFn = mockFetchResponses[url];
        // delete mockFetchResponses[url]; // Uncomment if mocks are strictly one-time
        return Promise.resolve(mockFn(options));
    }
    return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Mocked Fetch: URL Not Found'),
        json: () => Promise.resolve({ error: 'Mocked Fetch: URL Not Found' })
    });
}));
const fetch = require('node-fetch'); // fetch is now the jest.fn()

// Mock 'config'
jest.mock('../src/config/config', () => ({
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_API_ENDPOINT: 'https://test.geminiapi.com/v1/text/generate', // Adjusted for clarity
    GEMINI_IMAGE_API_KEY: 'test-gemini-image-key',
    GEMINI_IMAGE_API_ENDPOINT: 'https://test.geminiimageapi.com/v1/images/generate',
    VEO_API_KEY: 'test-veo-key',
    VEO_API_ENDPOINT: 'https://test.veoapi.com/v2/videos/generate',
    EMBEDDING_API_KEY: 'test-embedding-key',
    EMBEDDING_API_ENDPOINT: 'https://test.embeddingapi.com/v1/embed',
    NODE_ENV: 'test',
    PORT: '3001'
}));
const config = require('../src/config/config'); // Import after mock

// Mock 'vectorService'
let recordedEmbeddingCalls = [];
let recordedAddVectorCalls = [];
jest.mock('../src/services/vectorService', () => ({
    generateEmbedding: jest.fn(async (text) => {
        recordedEmbeddingCalls.push(text);
        const mockVector = Array(10).fill(0).map((_, i) => (text.length + i) * 0.01);
        return { vector: mockVector };
    }),
    addAssetVector: jest.fn(async (projectId, assetId, vector) => {
        recordedAddVectorCalls.push({ projectId, assetId, vector });
    }),
    findSimilarAssets: jest.fn(async (projectId, queryVector, topN) => {
        // This mock will return the first asset's ID if assets exist in mockObjective for that projectId
        if (mockObjective && mockObjective.projectId === projectId && mockObjective.assets && mockObjective.assets.length > 0) {
            // Ensure the asset has an assetId property for this mock to work as expected by tests
            if (mockObjective.assets[0].assetId || mockObjective.assets[0].id) {
                 return [mockObjective.assets[0].assetId || mockObjective.assets[0].id];
            }
        }
        return [];
    })
}));
const vectorService = require('../src/services/vectorService'); // Import after mock

const agent = require('../src/agent');
const geminiService = require('../src/services/geminiService'); // Still need to mock parts of this

// NOTE: This test suite assumes that agent.js can be made to use the mockDataStore defined herein.
// For true unit testing, agent.js would need to support dependency injection for dataStore
// or a mocking framework like proxyquire/jest would be used to properly mock '../src/dataStore'.

console.log('Running tests for src/agent.js...');

let mockObjective;
let originalFetchGeminiResponse; // For geminiService.fetchGeminiResponse (text)
let originalExecutePlanStep;    // For geminiService.executePlanStep
let mockExecutePlanStepResponse;

function setup() {
    mockObjective = {
        id: 'test-objective-123',
        title: 'Test Objective',
        brief: 'A test objective.',
        projectId: 'test-project-456',
        plan: { steps: ['Step 1', 'Step 2'], status: 'approved', questions: [], currentStepIndex: 0 },
        chatHistory: [],
        assets: []
    };
    mockExecutePlanStepResponse = 'Default step response'; // Reset for each test

    global.dataStore = {
        findObjectiveById: (objectiveId) => (objectiveId === mockObjective.id ? mockObjective : null),
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
        findProjectById: (projectId) => (projectId === mockObjective.projectId ? { id: mockObjective.projectId, name: 'Test Project', assets: mockObjective.assets } : null),
        updateProjectById: (projectId, updateData) => {
            if (projectId === mockObjective.projectId) {
                if (updateData.assets !== undefined) mockObjective.assets = updateData.assets;
                return { ...mockObjective, ...updateData }; // Simplified project object
            }
            return null;
        }
    };

    // Keep direct mock for geminiService as it's more about controlling agent's interaction with it
    originalFetchGeminiResponse = geminiService.fetchGeminiResponse;
    originalExecutePlanStep = geminiService.executePlanStep;

    geminiService.fetchGeminiResponse = async (userInput, chatHistory, projectAssets) => {
        if (userInput === "error_test") throw new Error("Simulated service error");
        if (userInput.startsWith('The tool')) return `Gemini summary based on tool output: ${userInput.substring(0, 200)}...`;
        return `Mocked conversational response to: ${userInput}`;
    };
    geminiService.executePlanStep = async (stepDescription, chatHistory, projectAssets) => mockExecutePlanStepResponse;

    // Clear Jest mocks for fetch and vectorService before each test run
    fetch.mockClear();
    mockFetchResponses = {};
    vectorService.generateEmbedding.mockClear();
    vectorService.addAssetVector.mockClear();
    vectorService.findSimilarAssets.mockClear();
    recordedEmbeddingCalls = [];
    recordedAddVectorCalls = [];
}

function teardown() {
    geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
    geminiService.executePlanStep = originalExecutePlanStep;
    mockObjective = null;
    global.dataStore = undefined;
    mockExecutePlanStepResponse = null;

    // Clear mocks and responses
    fetch.mockClear();
    mockFetchResponses = {};
    vectorService.generateEmbedding.mockClear();
    vectorService.addAssetVector.mockClear();
    vectorService.findSimilarAssets.mockClear();
    recordedEmbeddingCalls = [];
    recordedAddVectorCalls = [];
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
// ... (rest of the existing test functions remain, but may need expect() syntax for consistency later)

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
    assert.deepStrictEqual(response2, { message: 'Executed Step B directly.', currentStep: 1, stepDescription: 'Step B', planStatus: 'in_progress' }, 'Test Failed: Step 2 direct response incorrect');
    assert.strictEqual(mockObjective.plan.currentStepIndex, 2, 'Test Failed: currentStepIndex not updated after step 2 (direct)');
    assert.strictEqual(mockObjective.plan.status, 'completed', 'Test Failed: Plan status not completed after step 2 (direct)');
    assert.strictEqual(mockObjective.chatHistory.length, 2, "Chat history length incorrect after step 2");
    assert.strictEqual(mockObjective.chatHistory[1].content, 'Executed Step B directly.', "Chat history content incorrect after step 2");


    const response3 = await agent.getAgentResponse('User input after steps', [], mockObjective.id);
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
    mockObjective.assets = [
        { assetId: 'asset_dog_1', name: 'dog park video', description: 'dogs playing fetch', type: 'video', url: 'http://example.com/dog.mp4' },
        { assetId: 'asset_cat_1', name: 'cat picture', description: 'a tabby cat', type: 'image', url: 'http://example.com/cat.jpg' }
    ];
    mockExecutePlanStepResponse = { tool_call: { name: "semantic_search_assets", arguments: { query: "dogs" } } };

    const response = await agent.getAgentResponse('User input for search', [], mockObjective.id);

    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    const expectedToolOutput = JSON.stringify([{ id: 'asset_dog_1', name: 'dog park video', type: 'video', description: 'dogs playing fetch', url: 'http://example.com/dog.mp4' }]);
    expect(response.message).toContain(expectedToolOutput);
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    expect(mockObjective.chatHistory.length).toBe(2);
    expect(mockObjective.chatHistory[0].content).toContain('semantic_search_assets');
    expect(mockObjective.chatHistory[1].content).toMatch(/^Gemini summary based on tool output:/);
    expect(vectorService.generateEmbedding).toHaveBeenCalledWith("dogs");
    expect(vectorService.findSimilarAssets).toHaveBeenCalledWith(mockObjective.projectId, expect.any(Array), 5);
    console.log('Test Passed: Agent executes semantic_search_assets tool.');
    teardown();
}

async function testAgentExecutesCreateImageAssetTool() {
    console.log('Test: Agent executes create_image_asset tool...');
    setup();
    mockObjective.plan = { steps: ['Create image of a sunset'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockObjective.assets = [];
    const promptForTool = "a beautiful sunset";
    const expectedImageUrl = 'http://mocked-api.com/generated_image.jpg';

    mockExecutePlanStepResponse = { tool_call: { name: "create_image_asset", arguments: { prompt: promptForTool } } };
    mockFetchResponses[config.GEMINI_IMAGE_API_ENDPOINT] = (options) => {
        expect(JSON.parse(options.body).prompt).toBe(promptForTool);
        expect(options.headers.Authorization).toBe(`Bearer ${config.GEMINI_IMAGE_API_KEY}`);
        return {
            ok: true,
            status: 200,
            json: async () => ({ imageUrl: expectedImageUrl })
        };
    };

    const response = await agent.getAgentResponse('User input for image', [], mockObjective.id);

    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    expect(fetch).toHaveBeenCalledWith(config.GEMINI_IMAGE_API_ENDPOINT, expect.anything());
    expect(mockObjective.assets.length).toBe(1);
    expect(mockObjective.assets[0].type).toBe('image');
    expect(mockObjective.assets[0].prompt).toBe(promptForTool);
    expect(mockObjective.assets[0].url).toBe(expectedImageUrl);
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    expect(vectorService.generateEmbedding).toHaveBeenCalled();
    expect(vectorService.addAssetVector).toHaveBeenCalledWith(mockObjective.projectId, mockObjective.assets[0].assetId, expect.any(Array));
    console.log('Test Passed: Agent executes create_image_asset tool.');
    teardown();
}

async function testAgentHandlesImageGenerationApiError() {
    console.log('Test: Agent handles image generation API error...');
    setup();
    mockObjective.plan = { steps: ['Create image of a cat'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = { tool_call: { name: "create_image_asset", arguments: { prompt: "a grumpy cat" } } };
    mockFetchResponses[config.GEMINI_IMAGE_API_ENDPOINT] = (options) => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error from mock',
        json: async () => ({ error: 'Internal Server Error from mock' })
    });

    const response = await agent.getAgentResponse('User input for image error', [], mockObjective.id);

    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    expect(response.message).toContain("Failed to generate image: API Error 500");
    expect(mockObjective.assets.length).toBe(0);
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    console.log('Test Passed: Agent handles image generation API error.');
    teardown();
}


async function testAgentHandlesUnknownToolNameFromGemini() {
    console.log('Test: Agent handles unknown tool name from Gemini...');
    setup();
    mockObjective.plan = { steps: ['Use unknown tool'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = { tool_call: { name: "non_existent_tool", arguments: { param: "value" } } };

    const response = await agent.getAgentResponse('User input for unknown tool', [], mockObjective.id);

    expect(response.message).toContain("Error: The agent tried to use an unknown tool: non_existent_tool");
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    expect(mockObjective.chatHistory.some(m => m.speaker === 'system' && m.content.includes('Error: Tool non_existent_tool not found.'))).toBe(true);
    console.log('Test Passed: Agent handles unknown tool name from Gemini.');
    teardown();
}

async function testStepCompletesDirectlyWithoutToolCall() {
    console.log('Test: Step completes directly without tool call...');
    setup();
    mockObjective.plan = { steps: ['A simple text step'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = 'This step was simple and completed directly by Gemini.';

    const response = await agent.getAgentResponse('User input for simple step', [], mockObjective.id);

    expect(response.message).toBe('This step was simple and completed directly by Gemini.');
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    expect(mockObjective.chatHistory.some(m => m.speaker === 'agent' && m.content === mockExecutePlanStepResponse)).toBe(true);
    console.log('Test Passed: Step completes directly without tool call.');
    teardown();
}

// Run tests
async function runTests() {
  try {
    await testAgentReturnsServiceResponseForConversation();
    await testAgentHandlesServiceErrorInConversation();
    await testPlanExecutionFlow_DirectResponses();
    await testPlanStartsExecutionFromCorrectIndex_DirectResponse();
    await testPlanAlreadyCompletedReturnsAppropriateMessage();
    await testPlanNotApprovedReturnsApprovalMessage();

    // New tool execution tests
    await testAgentExecutesSemanticSearchTool();
    await testAgentExecutesCreateImageAssetTool();
    await testAgentHandlesImageGenerationApiError(); // Added
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
