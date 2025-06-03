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

// Mock 'toolExecutorService'
const mockToolExecutorOutput = {
    // e.g., facebook_managed_page_posts_search: JSON.stringify({ data: [{id: 'fb_page_post1'}] })
};
let lastToolExecutorCall = null;

jest.mock('../src/services/toolExecutorService', () => ({
    execute_facebook_managed_page_posts_search: jest.fn(async (params, projectId) => {
        lastToolExecutorCall = { name: 'execute_facebook_managed_page_posts_search', params, projectId };
        return mockToolExecutorOutput.facebook_managed_page_posts_search || JSON.stringify({error: 'Tool facebook_managed_page_posts_search not mocked in test'});
    }),
    execute_facebook_public_posts_search: jest.fn(async (params, projectId) => {
        lastToolExecutorCall = { name: 'execute_facebook_public_posts_search', params, projectId };
        return mockToolExecutorOutput.facebook_public_posts_search || JSON.stringify({error: 'Tool facebook_public_posts_search not mocked in test'});
    }),
    execute_tiktok_public_posts_search: jest.fn(async (params, projectId) => {
        lastToolExecutorCall = { name: 'execute_tiktok_public_posts_search', params, projectId };
        return mockToolExecutorOutput.tiktok_public_posts_search || JSON.stringify({error: 'Tool tiktok_public_posts_search not mocked in test'});
    }),
    execute_facebook_create_post: jest.fn(async (params, projectId) => {
        lastToolExecutorCall = { name: 'execute_facebook_create_post', params, projectId };
        // Simulate asset creation for project used by toolExecutorService if mock output suggests success
        if (mockObjective && mockObjective.projectId === projectId &&
            mockToolExecutorOutput.facebook_create_post &&
            JSON.parse(mockToolExecutorOutput.facebook_create_post).id) {
             if(!mockObjective.assets) mockObjective.assets = [];
             // This part is tricky as the actual asset creation happens in toolExecutorService.
             // The mock here should just return what toolExecutorService would.
             // The agent test will verify if the agent *would have* updated assets based on this response.
        }
        return mockToolExecutorOutput.facebook_create_post || JSON.stringify({error: 'Tool facebook_create_post not mocked in test'});
    }),
    execute_tiktok_create_post: jest.fn(async (params, projectId) => {
        lastToolExecutorCall = { name: 'execute_tiktok_create_post', params, projectId };
        return mockToolExecutorOutput.tiktok_create_post || JSON.stringify({error: 'Tool tiktok_create_post not mocked in test'});
    }),
    perform_semantic_search_assets_tool: jest.fn(async (query, projectId) => {
        lastToolExecutorCall = { name: 'perform_semantic_search_assets_tool', query, projectId };
        return mockToolExecutorOutput.perform_semantic_search_assets_tool || JSON.stringify({error: 'Tool perform_semantic_search_assets_tool not mocked in test'});
    }),
    create_image_asset_tool: jest.fn(async (prompt, projectId) => {
        lastToolExecutorCall = { name: 'create_image_asset_tool', prompt, projectId };
        // Simulate that the toolExecutorService would have updated assets if successful
        if (mockObjective && mockObjective.projectId === projectId &&
            mockToolExecutorOutput.create_image_asset_tool &&
            JSON.parse(mockToolExecutorOutput.create_image_asset_tool).asset_id) {
           if(!mockObjective.assets) mockObjective.assets = [];
           const newAssetData = JSON.parse(mockToolExecutorOutput.create_image_asset_tool);
           // This mock now needs to reflect that the toolExecutorService would have created the asset.
           // So, we add it to mockObjective.assets for the agent test to correctly verify subsequent logic.
            mockObjective.assets.push({
                assetId: newAssetData.asset_id,
                name: newAssetData.name,
                type:'image',
                url: newAssetData.image_url,
                prompt: prompt
            });
       }
       return mockToolExecutorOutput.create_image_asset_tool || JSON.stringify({error: 'Tool create_image_asset_tool not mocked in test'});
    }),
    create_video_asset_tool: jest.fn(async (prompt, projectId) => {
        lastToolExecutorCall = { name: 'create_video_asset_tool', prompt, projectId };
        return mockToolExecutorOutput.create_video_asset_tool || JSON.stringify({error: 'Tool create_video_asset_tool not mocked in test'});
    })
}));
const toolExecutorService = require('../src/services/toolExecutorService'); // Import after mock

const agent = require('../src/agent');
const geminiService = require('../src/services/geminiService');

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

    // Clear toolExecutorService mocks
    lastToolExecutorCall = null;
    Object.values(toolExecutorService).forEach(mockFn => {
        if (jest.isMockFunction(mockFn)) {
            mockFn.mockClear();
        }
    });
    // Clear any predefined outputs for toolExecutorService
    Object.keys(mockToolExecutorOutput).forEach(k => delete mockToolExecutorOutput[k]);
}

function teardown() {
    geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
    geminiService.executePlanStep = originalExecutePlanStep;
    mockObjective = null;
    global.dataStore = undefined;
    mockExecutePlanStepResponse = null;

    fetch.mockClear();
    mockFetchResponses = {};
    vectorService.generateEmbedding.mockClear();
    vectorService.addAssetVector.mockClear();
    vectorService.findSimilarAssets.mockClear();
    recordedEmbeddingCalls = [];
    recordedAddVectorCalls = [];

    Object.keys(mockToolExecutorOutput).forEach(k => delete mockToolExecutorOutput[k]);
    lastToolExecutorCall = null;
    // Clear mocks on toolExecutorService functions
     Object.values(toolExecutorService).forEach(mockFn => {
        if (jest.isMockFunction(mockFn)) {
            mockFn.mockClear();
        }
    });
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

// --- Updated Tests for Tool Execution (using toolExecutorService mock) ---

async function testAgentExecutesSemanticSearchTool() {
    console.log('Test: Agent executes semantic_search_assets tool via toolExecutorService...');
    setup();
    mockObjective.plan = { steps: ['Search for dogs'], status: 'approved', currentStepIndex: 0, questions: [] };
    // Assets that the perform_semantic_search_assets_tool mock might return based on.
    // The actual search logic is in toolExecutorService, so we just need to ensure the agent passes params.
    mockObjective.assets = [
        { assetId: 'asset_dog_1', name: 'dog park video', description: 'dogs playing fetch', type: 'video', url: 'http://example.com/dog.mp4' }
    ];
    const searchQuery = "dogs";
    mockExecutePlanStepResponse = { tool_call: { name: "semantic_search_assets", arguments: { query: searchQuery } } };

    const mockToolResults = [{ id: 'asset_dog_1', name: 'dog park video', type: 'video', description: 'dogs playing fetch', url: 'http://example.com/dog.mp4' }];
    mockToolExecutorOutput.perform_semantic_search_assets_tool = JSON.stringify(mockToolResults);

    const response = await agent.getAgentResponse('User input for search', [], mockObjective.id);

    expect(toolExecutorService.perform_semantic_search_assets_tool).toHaveBeenCalledWith(searchQuery, mockObjective.projectId);
    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    expect(response.message).toContain(JSON.stringify(mockToolResults));
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    expect(mockObjective.chatHistory.length).toBe(2);
    expect(mockObjective.chatHistory[0].content).toContain('semantic_search_assets');
    expect(mockObjective.chatHistory[1].content).toMatch(/^Gemini summary based on tool output:/);
    console.log('Test Passed: Agent executes semantic_search_assets tool via toolExecutorService.');
    teardown();
}

async function testAgentExecutesCreateImageAssetTool() {
    console.log('Test: Agent executes create_image_asset tool via toolExecutorService...');
    setup();
    mockObjective.plan = { steps: ['Create image of a sunset'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockObjective.assets = []; // Start with no assets for this test
    const promptForTool = "a beautiful sunset";
    const expectedAssetId = 'img_mock_123_agent_test';
    const expectedImageUrl = 'http://mocked-api.com/generated_image_for_agent.jpg';

    mockExecutePlanStepResponse = { tool_call: { name: "create_image_asset", arguments: { prompt: promptForTool } } };
    // Mock the response from toolExecutorService.create_image_asset_tool
    // This mock should also simulate adding the asset to mockObjective.assets if agent relies on it
    mockToolExecutorOutput.create_image_asset_tool = JSON.stringify({
        asset_id: expectedAssetId,
        image_url: expectedImageUrl,
        name: `Generated Image: ${promptForTool.substring(0,30)}...`,
        message: 'Image asset created...'
    });
    // The mock for toolExecutorService.create_image_asset_tool in setup() handles adding to mockObjective.assets

    const response = await agent.getAgentResponse('User input for image', [], mockObjective.id);

    expect(toolExecutorService.create_image_asset_tool).toHaveBeenCalledWith(promptForTool, mockObjective.projectId);
    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    expect(response.message).toContain(expectedAssetId);

    expect(mockObjective.assets.length).toBe(1);
    expect(mockObjective.assets[0].assetId).toBe(expectedAssetId);
    expect(mockObjective.assets[0].type).toBe('image');
    expect(mockObjective.assets[0].prompt).toBe(promptForTool);
    expect(mockObjective.assets[0].url).toBe(expectedImageUrl);

    expect(mockObjective.plan.currentStepIndex).toBe(1);
    console.log('Test Passed: Agent executes create_image_asset tool via toolExecutorService.');
    teardown();
}

async function testAgentHandlesImageGenerationApiError() {
    console.log('Test: Agent handles image generation API error...');
    setup();
    mockObjective.plan = { steps: ['Create image of a cat'], status: 'approved', currentStepIndex: 0, questions: [] };
    mockExecutePlanStepResponse = { tool_call: { name: "create_image_asset", arguments: { prompt: "a grumpy cat" } } };

    // Mock the toolExecutorService.create_image_asset_tool to return an error
    mockToolExecutorOutput.create_image_asset_tool = JSON.stringify({ error: "Failed to generate image: API Error 500 from tool service" });

    const response = await agent.getAgentResponse('User input for image error', [], mockObjective.id);

    expect(toolExecutorService.create_image_asset_tool).toHaveBeenCalledWith("a grumpy cat", mockObjective.projectId);
    expect(response.message).toMatch(/^Gemini summary based on tool output:/);
    expect(response.message).toContain("Failed to generate image: API Error 500 from tool service");
    expect(mockObjective.assets.length).toBe(0); // No asset should have been added
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    console.log('Test Passed: Agent handles image generation error from tool service.');
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

    // Updated tool execution tests
    await testAgentExecutesSemanticSearchTool();
    await testAgentExecutesCreateImageAssetTool();
    await testAgentHandlesImageGenerationApiError();
    await testAgentHandlesUnknownToolNameFromGemini();
    await testStepCompletesDirectlyWithoutToolCall();

    // Social media tool tests
    await testAgentExecutesFacebookManagedPageSearch();
    await testAgentExecutesFacebookCreatePost();
    await testAgentHandlesFacebookCreatePostErrorFromToolService();
    // Add calls to testAgentExecutesFacebookPublicSearch and testAgentExecutesTikTokSearch etc. when implemented

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

// --- New tests for Social Media Tools ---
async function testAgentExecutesFacebookManagedPageSearch() {
    console.log('Test: Agent executes facebook_managed_page_posts_search tool...');
    setup();
    mockObjective.plan = { steps: ['Search FB page for cats'], status: 'approved', currentStepIndex: 0, questions: [] };

    mockExecutePlanStepResponse = {
        tool_call: { name: "facebook_managed_page_posts_search", arguments: { keywords: "cats" } }
    };
    const mockFbSearchResult = { data: [{id: 'fb_page_post1', message: 'Cats on the page!'}] };
    mockToolExecutorOutput.facebook_managed_page_posts_search = JSON.stringify(mockFbSearchResult);

    const response = await agent.getAgentResponse('User input for FB page search', [], mockObjective.id);

    expect(toolExecutorService.execute_facebook_managed_page_posts_search).toHaveBeenCalledWith({ keywords: "cats" }, mockObjective.projectId);
    expect(response.message).toMatch(/Gemini summary based on tool output:.*fb_page_post1/);
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    const lastMessage = mockObjective.chatHistory[mockObjective.chatHistory.length - 1];
    const secondLastMessage = mockObjective.chatHistory[mockObjective.chatHistory.length - 2];
    expect(secondLastMessage.content).toMatch(/Called tool facebook_managed_page_posts_search/);
    expect(lastMessage.content).toEqual(response.message);
    console.log('Test Passed: Agent executes facebook_managed_page_posts_search.');
    teardown();
}

async function testAgentExecutesFacebookCreatePost() {
    console.log('Test: Agent executes facebook_create_post tool...');
    setup();
    mockObjective.plan = { steps: ['Post "Hello FB" to page'], status: 'approved', currentStepIndex: 0, questions: [] };
    const postText = "Hello FB";
    mockExecutePlanStepResponse = {
        tool_call: { name: "facebook_create_post", arguments: { text_content: postText } }
    };
    const mockPostResult = { id: "fb_page_123_post_abc" };
    mockToolExecutorOutput.facebook_create_post = JSON.stringify(mockPostResult);

    const response = await agent.getAgentResponse('User input for FB post', [], mockObjective.id);

    expect(toolExecutorService.execute_facebook_create_post).toHaveBeenCalledWith({ text_content: postText }, mockObjective.projectId);
    expect(response.message).toMatch(/Gemini summary based on tool output:.*fb_page_123_post_abc/);
    expect(mockObjective.plan.currentStepIndex).toBe(1);
    console.log('Test Passed: Agent executes facebook_create_post.');
    teardown();
}

async function testAgentHandlesFacebookCreatePostErrorFromToolService() {
    console.log('Test: Agent handles facebook_create_post error from tool service...');
    setup();
    mockObjective.plan = { steps: ['Post "Error FB" to page'], status: 'approved', currentStepIndex: 0, questions: [] };
    const postText = "Error FB";
    mockExecutePlanStepResponse = {
        tool_call: { name: "facebook_create_post", arguments: { text_content: postText } }
    };
    mockToolExecutorOutput.facebook_create_post = JSON.stringify({ error: "Failed to post to FB for test" });

    const response = await agent.getAgentResponse('User input for FB post error', [], mockObjective.id);

    expect(toolExecutorService.execute_facebook_create_post).toHaveBeenCalledWith({ text_content: postText }, mockObjective.projectId);
    expect(response.message).toMatch(/Gemini summary based on tool output:.*Failed to post to FB for test/);
    expect(mockObjective.plan.currentStepIndex).toBe(1); // Step is still consumed
    console.log('Test Passed: Agent handles facebook_create_post error.');
    teardown();
}

module.exports = { runTests }; // Export for potential use with a test runner
