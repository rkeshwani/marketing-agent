// const assert = require('node:assert'); // Will be replaced by expect
const expect = require('expect');

// Mock 'node-fetch'
let mockFetchResponses = {};
jest.mock('node-fetch', () => jest.fn((url, options) => {
    if (mockFetchResponses[url]) {
        const mockFn = mockFetchResponses[url];
        return Promise.resolve(mockFn(options));
    }
    return Promise.resolve({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Mocked Fetch: URL Not Found'),
        json: () => Promise.resolve({ error: 'Mocked Fetch: URL Not Found' })
    });
}));
const fetch = require('node-fetch');

// Mock 'config'
jest.mock('../src/config/config', () => ({
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_API_ENDPOINT: 'https://test.geminiapi.com/v1/text/generate',
    GEMINI_IMAGE_API_KEY: 'test-gemini-image-key',
    GEMINI_IMAGE_API_ENDPOINT: 'https://test.geminiimageapi.com/v1/images/generate',
    VEO_API_KEY: 'test-veo-key',
    VEO_API_ENDPOINT: 'https://test.veoapi.com/v2/videos/generate',
    EMBEDDING_API_KEY: 'test-embedding-key',
    EMBEDDING_API_ENDPOINT: 'https://test.embeddingapi.com/v1/embed',
    NODE_ENV: 'test',
    PORT: '3001'
}));
const config = require('../src/config/config');

// Mock 'vectorService'
let mockRecordedEmbeddingCalls = [];
let mockRecordedAddVectorCalls = [];
jest.mock('../src/services/vectorService', () => ({
    generateEmbedding: jest.fn(async (text) => {
        mockRecordedEmbeddingCalls.push(text);
        const mockVector = Array(10).fill(0).map((_, i) => (text.length + i) * 0.01);
        return { vector: mockVector };
    }),
    addAssetVector: jest.fn(async (projectId, assetId, vector) => {
        mockRecordedAddVectorCalls.push({ projectId, assetId, vector });
    }),
    findSimilarAssets: jest.fn(async (projectId, queryVector, topN) => {
        if (mockObjective && mockObjective.projectId === projectId && mockObjective.assets && mockObjective.assets.length > 0) {
            if (mockObjective.assets[0].assetId || mockObjective.assets[0].id) {
                 return [mockObjective.assets[0].assetId || mockObjective.assets[0].id];
            }
        }
        return [];
    })
}));
const vectorService = require('../src/services/vectorService');

// Mock 'toolExecutorService'
const mockToolExecutorOutput = {};
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
        if (mockObjective && mockObjective.projectId === projectId &&
            mockToolExecutorOutput.create_image_asset_tool &&
            JSON.parse(mockToolExecutorOutput.create_image_asset_tool).asset_id) {
           if(!mockObjective.assets) mockObjective.assets = [];
           const newAssetData = JSON.parse(mockToolExecutorOutput.create_image_asset_tool);
            mockObjective.assets.push({
                assetId: newAssetData.asset_id, name: newAssetData.name, type:'image',
                url: newAssetData.image_url, prompt: prompt
            });
       }
       return mockToolExecutorOutput.create_image_asset_tool || JSON.stringify({error: 'Tool create_image_asset_tool not mocked in test'});
    }),
    create_video_asset_tool: jest.fn(async (prompt, projectId) => {
        lastToolExecutorCall = { name: 'create_video_asset_tool', prompt, projectId };
        return mockToolExecutorOutput.create_video_asset_tool || JSON.stringify({error: 'Tool create_video_asset_tool not mocked in test'});
    })
}));
const toolExecutorService = require('../src/services/toolExecutorService');

const agent = require('../src/agent');
const geminiService = require('../src/services/geminiService');
const Objective = require('../src/models/Objective');

console.log('Running tests for src/agent.js...');

let mockObjective;
let originalFetchGeminiResponse;
let originalExecutePlanStep;
let originalGeneratePlanForObjective;

describe('Agent Logic', () => {
    beforeEach(setup);
    afterEach(teardown);

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

        global.dataStore = {
            findObjectiveById: jest.fn((objectiveId) => (objectiveId === mockObjective.id ? mockObjective : null)),
            updateObjectiveById: jest.fn((objectiveId, title, brief, plan, chatHistory) => {
                if (objectiveId === mockObjective.id) {
                    mockObjective.title = title !== undefined ? title : mockObjective.title;
                    mockObjective.brief = brief !== undefined ? brief : mockObjective.brief;
                    mockObjective.plan = plan !== undefined ? plan : mockObjective.plan;
                    mockObjective.chatHistory = chatHistory !== undefined ? chatHistory : mockObjective.chatHistory;
                    return { ...mockObjective };
                }
                return null;
            }),
            updateObjective: jest.fn((objectiveToUpdate) => {
                if (objectiveToUpdate.id === mockObjective.id) {
                    mockObjective = { ...mockObjective, ...objectiveToUpdate };
                    return mockObjective;
                }
                return null;
            }),
            findProjectById: jest.fn((projectId) => (projectId === mockObjective.projectId ? { id: mockObjective.projectId, name: 'Test Project', assets: mockObjective.assets } : null)),
            updateProjectById: jest.fn((projectId, updateData) => {
                if (projectId === mockObjective.projectId) {
                    if (updateData.assets !== undefined) mockObjective.assets = updateData.assets;
                    return { ...mockObjective, ...updateData };
                }
                return null;
            })
        };

        originalFetchGeminiResponse = geminiService.fetchGeminiResponse;
        originalExecutePlanStep = geminiService.executePlanStep;
        originalGeneratePlanForObjective = geminiService.generatePlanForObjective;

        geminiService.fetchGeminiResponse = jest.fn();
        geminiService.executePlanStep = jest.fn();
        geminiService.generatePlanForObjective = jest.fn().mockResolvedValue({
            planSteps: ['Generated Step 1 for ' + (mockObjective ? mockObjective.title : ''), 'Generated Step 2'],
            questions: ['Generated Question 1?']
        });

        fetch.mockClear();
        mockFetchResponses = {};
        if (vectorService.generateEmbedding.mockClear) vectorService.generateEmbedding.mockClear();
        if (vectorService.addAssetVector.mockClear) vectorService.addAssetVector.mockClear();
        if (vectorService.findSimilarAssets.mockClear) vectorService.findSimilarAssets.mockClear();
        mockRecordedEmbeddingCalls = [];
        mockRecordedAddVectorCalls = [];

        lastToolExecutorCall = null;
        Object.values(toolExecutorService).forEach(mockFn => {
            if (jest.isMockFunction(mockFn)) {
                mockFn.mockClear();
            }
        });
        Object.keys(mockToolExecutorOutput).forEach(k => delete mockToolExecutorOutput[k]);
    }

    function teardown() {
        geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
        geminiService.executePlanStep = originalExecutePlanStep;
        geminiService.generatePlanForObjective = originalGeneratePlanForObjective;

        mockObjective = null;
        if (global.dataStore) {
            Object.values(global.dataStore).forEach(mockFn => {
                if (jest.isMockFunction(mockFn)) {
                    mockFn.mockClear();
                }
            });
        }
        global.dataStore = undefined;

        fetch.mockClear();
        mockFetchResponses = {};
        if (vectorService.generateEmbedding.mockClear) vectorService.generateEmbedding.mockClear();
        if (vectorService.addAssetVector.mockClear) vectorService.addAssetVector.mockClear();
        if (vectorService.findSimilarAssets.mockClear) vectorService.findSimilarAssets.mockClear();
        mockRecordedEmbeddingCalls = [];
        mockRecordedAddVectorCalls = [];

        Object.keys(mockToolExecutorOutput).forEach(k => delete mockToolExecutorOutput[k]);
        lastToolExecutorCall = null;
         Object.values(toolExecutorService).forEach(mockFn => {
            if (jest.isMockFunction(mockFn)) {
                mockFn.mockClear();
            }
        });
    }

    describe('getAgentResponse - Conversational', () => {
        test('should return service response for general conversation when no plan active', async () => {
            // console.log('Test: agent should return service response for general conversation when no plan active...');
            mockObjective.plan = null; // No active plan
            const userInput = "Hello, agent!";
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(`Mocked conversational response to: ${userInput}`);
            const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
            expect(response).toBe(`Mocked conversational response to: ${userInput}`);
            // console.log('Test Passed: Agent returned conversational service response.');
        });

        test('should handle service error gracefully during conversation when no plan active', async () => {
            // console.log('Test: agent should handle service error gracefully during conversation when no plan active...');
            mockObjective.plan = null; // No active plan
            const userInput = "trigger_error_in_gemini";
            geminiService.fetchGeminiResponse.mockRejectedValueOnce(new Error("Simulated service error"));
            const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
            expect(response).toBe("Agent: I'm sorry, I encountered an error trying to get a response: Simulated service error");
            // console.log('Test Passed: Agent handled conversational service error.');
        });
    });

    // describe('getAgentResponse - Plan Execution (Direct Responses)', () => {
    //     test('should execute plan steps and handle direct responses correctly', async () => {
    //         console.log('Test: testPlanExecutionFlow_DirectResponses (no tools)...');
    //         mockObjective.plan = { steps: ['Step A', 'Step B'], status: 'approved', currentStepIndex: 0, questions: [] };

    //         geminiService.executePlanStep.mockResolvedValueOnce('Executed Step A directly.');
    //         const response1 = await agent.getAgentResponse('User input for step A', [], mockObjective.id);
    //         expect(response1).toEqual({ message: 'Executed Step A directly.', currentStep: 0, stepDescription: 'Step A', planStatus: 'in_progress' });
    //         expect(mockObjective.plan.currentStepIndex).toBe(1);
    //         expect(mockObjective.chatHistory).toHaveLength(1);
    //         expect(mockObjective.chatHistory[0].content).toBe('Executed Step A directly.');

    //         geminiService.executePlanStep.mockResolvedValueOnce('Executed Step B directly.');
    //         const response2 = await agent.getAgentResponse('User input for step B', [], mockObjective.id);
    //         expect(response2).toEqual({ message: 'Executed Step B directly.', currentStep: 1, stepDescription: 'Step B', planStatus: 'completed' });
    //         expect(mockObjective.plan.currentStepIndex).toBe(2);
    //         expect(mockObjective.plan.status).toBe('completed');
    //         expect(mockObjective.chatHistory).toHaveLength(2);
    //         expect(mockObjective.chatHistory[1].content).toBe('Executed Step B directly.');

    //         const response3 = await agent.getAgentResponse('User input after steps', [], mockObjective.id);
    //         expect(response3).toEqual({ message: 'All plan steps completed!', planStatus: 'completed', nextRunTime: undefined });
    //         expect(mockObjective.plan.status).toBe('completed');
    //         console.log('Test Passed: testPlanExecutionFlow_DirectResponses.');
    //     });

    //     test('should start execution from the correct step index', async () => {
    //         console.log('Test: testPlanStartsExecutionFromCorrectIndex_DirectResponse...');
    //         mockObjective.plan = { steps: ['Step X', 'Step Y', 'Step Z'], status: 'approved', currentStepIndex: 1, questions:[] };
    //         geminiService.executePlanStep.mockResolvedValueOnce('Executed Step Y directly.');
    //         const response = await agent.getAgentResponse('User input', [], mockObjective.id);
    //         expect(response).toEqual({ message: 'Executed Step Y directly.', currentStep: 1, stepDescription: 'Step Y', planStatus: 'in_progress' });
    //         expect(mockObjective.plan.currentStepIndex).toBe(2);
    //         console.log('Test Passed: testPlanStartsExecutionFromCorrectIndex_DirectResponse.');
    //     });
    // });

    // describe('getAgentResponse - Plan Status Checks', () => {
    //     test('should return appropriate message if plan is already completed', async () => {
    //         console.log('Test: testPlanAlreadyCompletedReturnsAppropriateMessage...');
    //         mockObjective.plan.status = 'completed';
    //         mockObjective.plan.steps = ['Step A', 'Step B'];
    //         mockObjective.plan.currentStepIndex = 2;
    //         const response = await agent.getAgentResponse('User input for completed plan', [], mockObjective.id);
    //         expect(response).toEqual({ message: 'All plan steps completed!', planStatus: 'completed', nextRunTime: undefined });
    //         console.log('Test Passed: testPlanAlreadyCompletedReturnsAppropriateMessage.');
    //     });

    //     test('should return approval message if plan is not approved', async () => {
    //         console.log('Test: testPlanNotApprovedReturnsApprovalMessage...');
    //         mockObjective.plan.status = 'pending_approval';
    //         const response = await agent.getAgentResponse('User input for pending plan', [], mockObjective.id);
    //         expect(response).toBe("It looks like there's a plan that needs your attention. Please approve the current plan before we proceed with this objective.");
    //         console.log('Test Passed: testPlanNotApprovedReturnsApprovalMessage.');
    //     });
    // });

});
// --- Rest of the original test functions remain commented out for now ---
/*
async function testPlanExecutionFlow_DirectResponses() {
    // ...
}
// ... etc ...

if (require.main === module) {
  runTests();
}
module.exports = { runTests };
*/
