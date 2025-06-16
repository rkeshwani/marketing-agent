// const assert = require('node:assert');
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
            mockObjective.plan = null;
            const userInput = "Hello, agent!";
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(`Mocked conversational response to: ${userInput}`);
            const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
            expect(response).toBe("It looks like there's a plan that needs your attention. A plan has not been initialized yet. Please try selecting the objective again, which may trigger initialization.");
        });

        test('should handle null plan gracefully (no error expected from fetchGeminiResponse)', async () => {
            mockObjective.plan = null;
            const userInput = "trigger_error_in_gemini";
            const response = await agent.getAgentResponse(userInput, [], mockObjective.id);
            expect(response).toBe("It looks like there's a plan that needs your attention. A plan has not been initialized yet. Please try selecting the objective again, which may trigger initialization.");
        });
    });

    describe('getAgentResponse - Plan Execution (Direct Responses)', () => {
        test('should execute plan steps and handle direct responses correctly', async () => {
            mockObjective.plan = { steps: ['Step A', 'Step B'], status: 'approved', currentStepIndex: 0, questions: [] };

            geminiService.executePlanStep.mockResolvedValueOnce('Executed Step A directly.');
            const response1 = await agent.getAgentResponse('User input for step A', [], mockObjective.id);
            expect(response1).toEqual({ message: 'Executed Step A directly.', currentStep: 0, stepDescription: 'Step A', planStatus: 'in_progress' });
            expect(mockObjective.plan.currentStepIndex).toBe(1);
            expect(mockObjective.chatHistory).toHaveLength(1);
            expect(mockObjective.chatHistory[0].content).toBe('Executed Step A directly.');

            geminiService.executePlanStep.mockResolvedValueOnce('Executed Step B directly.');
            const response2 = await agent.getAgentResponse('User input for step B', [], mockObjective.id);
            expect(response2).toEqual(expect.objectContaining({
                message: 'Plan instance completed! Last step result: Executed Step B directly.',
                currentStep: 1,
                stepDescription: 'Step B',
                planStatus: 'completed'
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(2);
            expect(mockObjective.plan.status).toBe('completed');
            expect(mockObjective.chatHistory).toHaveLength(2);
            expect(mockObjective.chatHistory[1].content).toBe('Executed Step B directly.');

            const response3 = await agent.getAgentResponse('User input after steps', [], mockObjective.id);
            expect(response3).toEqual({ message: 'All plan steps completed!', planStatus: 'completed', nextRunTime: undefined });
            expect(mockObjective.plan.status).toBe('completed');
        });

        test('should start execution from the correct step index', async () => {
            mockObjective.plan = { steps: ['Step X', 'Step Y', 'Step Z'], status: 'approved', currentStepIndex: 1, questions:[] };
            geminiService.executePlanStep.mockResolvedValueOnce('Executed Step Y directly.');
            const response = await agent.getAgentResponse('User input', [], mockObjective.id);
            expect(response).toEqual({ message: 'Executed Step Y directly.', currentStep: 1, stepDescription: 'Step Y', planStatus: 'in_progress' });
            expect(mockObjective.plan.currentStepIndex).toBe(2);
        });
    });

    describe('getAgentResponse - Plan Status Checks', () => {
        test('should return appropriate message if plan is already completed', async () => {
            mockObjective.plan.status = 'completed';
            mockObjective.plan.steps = ['Step A', 'Step B'];
            mockObjective.plan.currentStepIndex = 2;
            const response = await agent.getAgentResponse('User input for completed plan', [], mockObjective.id);
            expect(response).toEqual({ message: 'All plan steps completed!', planStatus: 'completed', nextRunTime: undefined });
        });

        test('should return approval message if plan is not approved', async () => {
            mockObjective.plan.status = 'pending_approval';
            const response = await agent.getAgentResponse('User input for pending plan', [], mockObjective.id);
            expect(response).toBe("It looks like there's a plan that needs your attention. Please approve the current plan before we proceed with this objective.");
        });
    });

    describe('getAgentResponse - Tool Execution', () => {
        test('should execute semantic_search_assets tool via toolExecutorService', async () => {
            mockObjective.plan = { steps: ['Search for dogs'], status: 'approved', currentStepIndex: 0, questions: [] };
            mockObjective.assets = [
                { assetId: 'asset_dog_1', name: 'dog park video', description: 'dogs playing fetch', type: 'video', url: 'http://example.com/dog.mp4' }
            ];
            const searchQuery = "dogs";
            geminiService.executePlanStep.mockResolvedValueOnce({ tool_call: { name: "semantic_search_assets", arguments: { query: searchQuery } } });
            const mockToolResults = [{ id: 'asset_dog_1', name: 'dog park video', type: 'video', description: 'dogs playing fetch', url: 'http://example.com/dog.mp4' }];
            mockToolExecutorOutput.perform_semantic_search_assets_tool = JSON.stringify(mockToolResults);
            const summaryText = `Gemini summary based on tool output: ${JSON.stringify(mockToolResults)}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for search', [], mockObjective.id);

            expect(toolExecutorService.perform_semantic_search_assets_tool).toHaveBeenCalledWith(searchQuery, mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed',
                currentStep: 0
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
            expect(mockObjective.chatHistory).toHaveLength(2);
            expect(mockObjective.chatHistory[0].content).toContain('semantic_search_assets');
            expect(mockObjective.chatHistory[1].content).toEqual(summaryText);
        });

        test('should execute create_image_asset tool via toolExecutorService and update assets', async () => {
            mockObjective.plan = { steps: ['Create image of a sunset'], status: 'approved', currentStepIndex: 0, questions: [] };
            mockObjective.assets = [];
            const promptForTool = "a beautiful sunset";
            const expectedAssetId = 'img_mock_123_agent_test';
            const expectedImageUrl = 'http://mocked-api.com/generated_image_for_agent.jpg';
            const toolExecutorResponse = {
                asset_id: expectedAssetId,
                image_url: expectedImageUrl,
                name: `Generated Image: ${promptForTool.substring(0,30)}...`,
                message: 'Image asset created...'
            };

            geminiService.executePlanStep.mockResolvedValueOnce({ tool_call: { name: "create_image_asset", arguments: { prompt: promptForTool } } });
            mockToolExecutorOutput.create_image_asset_tool = JSON.stringify(toolExecutorResponse);
            const summaryText = `Gemini summary of image creation: ${expectedAssetId}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for image', [], mockObjective.id);

            expect(toolExecutorService.create_image_asset_tool).toHaveBeenCalledWith(promptForTool, mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed',
                currentStep: 0
            }));
            expect(mockObjective.assets.length).toBe(1);
            expect(mockObjective.assets[0].assetId).toBe(expectedAssetId);
            expect(mockObjective.assets[0].type).toBe('image');
            expect(mockObjective.assets[0].prompt).toBe(promptForTool);
            expect(mockObjective.assets[0].url).toBe(expectedImageUrl);
            expect(mockObjective.plan.currentStepIndex).toBe(1);
        });

        test('should handle image generation API error from tool service', async () => {
            mockObjective.plan = { steps: ['Create image of a cat'], status: 'approved', currentStepIndex: 0, questions: [] };
            geminiService.executePlanStep.mockResolvedValueOnce({ tool_call: { name: "create_image_asset", arguments: { prompt: "a grumpy cat" } } });
            const toolErrorOutput = { error: "Failed to generate image: API Error 500 from tool service" };
            mockToolExecutorOutput.create_image_asset_tool = JSON.stringify(toolErrorOutput);
            const summaryText = `Gemini summary of image error: ${toolErrorOutput.error}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for image error', [], mockObjective.id);

            expect(toolExecutorService.create_image_asset_tool).toHaveBeenCalledWith("a grumpy cat", mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed',
                currentStep: 0
            }));
            expect(mockObjective.assets.length).toBe(0);
            expect(mockObjective.plan.currentStepIndex).toBe(1);
        });

        test('should handle unknown tool name from Gemini', async () => {
            mockObjective.plan = { steps: ['Use unknown tool'], status: 'approved', currentStepIndex: 0, questions: [] };
            geminiService.executePlanStep.mockResolvedValueOnce({ tool_call: { name: "non_existent_tool", arguments: { param: "value" } } });

            const response = await agent.getAgentResponse('User input for unknown tool', [], mockObjective.id);

            expect(response).toEqual(expect.objectContaining({
                message: "Plan instance completed! Last step result: Error: The agent tried to use an unknown tool: non_existent_tool.",
                planStatus: 'completed',
                currentStep: 0
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
            expect(mockObjective.chatHistory.some(m => m.speaker === 'system' && m.content.includes('Error: Tool non_existent_tool not found.'))).toBe(true);
        });

        test('should complete step directly without tool call if no tool_call in response', async () => {
            mockObjective.plan = { steps: ['A simple text step'], status: 'approved', currentStepIndex: 0, questions: [] };
            const directResponseText = 'This step was simple and completed directly by Gemini.';
            geminiService.executePlanStep.mockResolvedValueOnce(directResponseText);

            const response = await agent.getAgentResponse('User input for simple step', [], mockObjective.id);

            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${directResponseText}`,
                planStatus: 'completed',
                currentStep: 0
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
            expect(mockObjective.chatHistory.some(m => m.speaker === 'agent' && m.content === directResponseText)).toBe(true);
        });
    });

    // Social Media tests to be refactored next
    describe('getAgentResponse - Social Media Tool Execution', () => {
        test('should execute facebook_managed_page_posts_search tool', async () => {
            mockObjective.plan = { steps: ['Search FB page for cats'], status: 'approved', currentStepIndex: 0, questions: [] };
            geminiService.executePlanStep.mockResolvedValueOnce({
                tool_call: { name: "facebook_managed_page_posts_search", arguments: { keywords: "cats" } }
            });
            const mockFbSearchResult = { data: [{id: 'fb_page_post1', message: 'Cats on the page!'}] };
            mockToolExecutorOutput.facebook_managed_page_posts_search = JSON.stringify(mockFbSearchResult);
            const summaryText = `Gemini summary of FB Managed Page Search: ${mockFbSearchResult.data[0].id}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for FB page search', [], mockObjective.id);

            expect(toolExecutorService.execute_facebook_managed_page_posts_search).toHaveBeenCalledWith({ keywords: "cats" }, mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed'
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
            expect(mockObjective.chatHistory[1].content).toEqual(summaryText);
        });

        test('should execute facebook_create_post tool', async () => {
            mockObjective.plan = { steps: ['Post "Hello FB" to page'], status: 'approved', currentStepIndex: 0, questions: [] };
            const postText = "Hello FB";
            geminiService.executePlanStep.mockResolvedValueOnce({
                tool_call: { name: "facebook_create_post", arguments: { text_content: postText } }
            });
            const mockPostResult = { id: "fb_page_123_post_abc" };
            mockToolExecutorOutput.facebook_create_post = JSON.stringify(mockPostResult);
            const summaryText = `Gemini summary of FB post: ${mockPostResult.id}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for FB post', [], mockObjective.id);

            expect(toolExecutorService.execute_facebook_create_post).toHaveBeenCalledWith({ text_content: postText }, mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed'
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
        });

        test('should handle facebook_create_post error from tool service', async () => {
            mockObjective.plan = { steps: ['Post "Error FB" to page'], status: 'approved', currentStepIndex: 0, questions: [] };
            const postText = "Error FB";
            geminiService.executePlanStep.mockResolvedValueOnce({
                tool_call: { name: "facebook_create_post", arguments: { text_content: postText } }
            });
            const toolErrorOutput = { error: "Failed to post to FB for test" };
            mockToolExecutorOutput.facebook_create_post = JSON.stringify(toolErrorOutput);
            const summaryText = `Gemini summary of FB post error: ${toolErrorOutput.error}`;
            geminiService.fetchGeminiResponse.mockResolvedValueOnce(summaryText);

            const response = await agent.getAgentResponse('User input for FB post error', [], mockObjective.id);

            expect(toolExecutorService.execute_facebook_create_post).toHaveBeenCalledWith({ text_content: postText }, mockObjective.projectId);
            expect(response).toEqual(expect.objectContaining({
                message: `Plan instance completed! Last step result: ${summaryText}`,
                planStatus: 'completed'
            }));
            expect(mockObjective.plan.currentStepIndex).toBe(1);
        });
    });

    // initializeAgent tests
    describe('initializeAgent', () => {
        test('should generate and store a plan for a non-recurring objective', async () => {
            mockObjective.isRecurring = false;
            mockObjective.plan = {}; // Reset plan part
            const mockGeneratedPlan = {
                planSteps: ['Init Step 1', 'Init Step 2'],
                questions: ['Init Q1?']
            };
            geminiService.generatePlanForObjective.mockResolvedValue(mockGeneratedPlan);
            global.dataStore.updateObjective.mockClear();

            const initializedObjective = await agent.initializeAgent(mockObjective.id);

            expect(geminiService.generatePlanForObjective).toHaveBeenCalledWith(mockObjective, []);
            expect(initializedObjective.plan.steps).toEqual(mockGeneratedPlan.planSteps);
            expect(initializedObjective.plan.questions).toEqual(mockGeneratedPlan.questions);
            expect(initializedObjective.plan.status).toBe('pending_approval');
            expect(initializedObjective.originalPlan).toBeUndefined();
            expect(global.dataStore.updateObjective).toHaveBeenCalledWith(initializedObjective);
        });

        test('should store originalPlan for a recurring objective', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = null;
            mockObjective.plan = {};
            const mockGeneratedPlan = {
                planSteps: ['Recurring Step 1', 'Recurring Step 2'],
                questions: ['Recurring Q1?']
            };
            geminiService.generatePlanForObjective.mockResolvedValue(mockGeneratedPlan);
            global.dataStore.updateObjective.mockClear();

            await agent.initializeAgent(mockObjective.id);

            expect(geminiService.generatePlanForObjective).toHaveBeenCalledWith(mockObjective, []);
            expect(mockObjective.originalPlan).toEqual({
                steps: mockGeneratedPlan.planSteps,
                questions: mockGeneratedPlan.questions
            });
            expect(mockObjective.plan.steps).toEqual(mockGeneratedPlan.planSteps);
            expect(mockObjective.plan.status).toBe('pending_approval');
            expect(global.dataStore.updateObjective).toHaveBeenCalledWith(mockObjective);
        });

        test('should throw error if objective not found during initialization', async () => {
            global.dataStore.findObjectiveById.mockReturnValueOnce(null);
            await expect(agent.initializeAgent('nonexistent-id')).rejects.toThrow('Objective with ID nonexistent-id not found.');
        });

        test('should handle error during plan generation in initializeAgent', async () => {
            geminiService.generatePlanForObjective.mockRejectedValueOnce(new Error("AI plan generation failed"));
            global.dataStore.updateObjective.mockClear();

            await expect(agent.initializeAgent(mockObjective.id)).rejects.toThrow("Failed to generate plan: AI plan generation failed");

            expect(mockObjective.plan.status).toBe('error_generating_plan');
            expect(mockObjective.plan.steps).toEqual([]);
            expect(mockObjective.plan.questions).toEqual(['Failed to generate plan: AI plan generation failed']);
            expect(global.dataStore.updateObjective).toHaveBeenCalledWith(mockObjective);
        });
    });

    // Recurrence tests
    describe('getAgentResponse - Recurrence', () => {
        test('should schedule next run when recurring instance completes', async () => {
            mockObjective.isRecurring = true;
            mockObjective.recurrenceRule = { frequency: 'daily', interval: 1 };
            mockObjective.originalPlan = {
                steps: ['Original Step 1', 'Original Step 2'],
                questions: ['Original Q1?']
            };
            mockObjective.plan = {
                steps: ['Current Instance Step 1', 'Current Instance Step 2'],
                status: 'approved',
                currentStepIndex: 1,
                questions: []
            };
            const finalStepSummary = 'Final step summary for recurrence.';
            geminiService.executePlanStep.mockResolvedValueOnce(finalStepSummary);
            global.dataStore.updateObjective.mockClear();

            const response = await agent.getAgentResponse('User input for final step', [], mockObjective.id);

            expect(response.planStatus).toBe('pending_scheduling');
            expect(mockObjective.plan.status).toBe('pending_scheduling');
            expect(mockObjective.nextRunTime).toBeInstanceOf(Date);
            const now = new Date();
            const expectedNextRunTime = new Date(now.setDate(now.getDate() + 1));
            expect(Math.abs(mockObjective.nextRunTime.getTime() - expectedNextRunTime.getTime())).toBeLessThan(5000); // Allow 5s delta
            expect(mockObjective.plan.steps).toEqual(mockObjective.originalPlan.steps);
            expect(mockObjective.plan.currentStepIndex).toBe(0);
            expect(mockObjective.currentRecurrenceContext).toEqual({
                previousPostSummary: finalStepSummary,
                lastCompletionTime: expect.any(String)
            });
            expect(global.dataStore.updateObjective).toHaveBeenCalledWith(mockObjective);
        });

        test('should refresh plan for scheduled recurring task', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = { steps: ['Old Step 1'], questions: ['Old Q1?'] };
            mockObjective.plan = {
                steps: ['Old Step 1'], // Copied from original
                status: 'approved',
                currentStepIndex: 0,
                questions: ['Old Q1?']
            };
            mockObjective.currentRecurrenceContext = { previousPostSummary: 'Summary from last run' };
            const refreshedPlanFromGemini = {
                planSteps: ['Refreshed Step 1 based on context', 'Refreshed Step 2'],
                questions: ['Refreshed Q1?']
            };
            geminiService.generatePlanForObjective.mockResolvedValue(refreshedPlanFromGemini);
            const firstRefreshedStepExecutionResult = "Executing refreshed step 1";
            geminiService.executePlanStep.mockResolvedValueOnce(firstRefreshedStepExecutionResult);
            global.dataStore.updateObjective.mockClear();

            const response = await agent.getAgentResponse('User triggers interaction with scheduled task', [], mockObjective.id);

            expect(geminiService.generatePlanForObjective).toHaveBeenCalledWith(mockObjective, []);
            expect(mockObjective.plan.steps).toEqual(refreshedPlanFromGemini.planSteps);
            expect(mockObjective.plan.questions).toEqual(refreshedPlanFromGemini.questions);
            expect(global.dataStore.updateObjective).toHaveBeenCalledWith(mockObjective);

            expect(response).toEqual(expect.objectContaining({
                 message: `Plan instance completed! Last step result: ${firstRefreshedStepExecutionResult}`, // Assuming it's a single step plan for this test after refresh for simplicity
                 stepDescription: refreshedPlanFromGemini.planSteps[0], // Actually it's the first step of refreshed plan
                 planStatus: 'in_progress' // If refreshed plan has more than 1 step
            }));
             // If refreshed plan has 2 steps, after 1st step, index is 1, status in_progress
            if (refreshedPlanFromGemini.planSteps.length > 1) {
                expect(mockObjective.plan.currentStepIndex).toBe(1);
                expect(response.planStatus).toBe('in_progress');
            } else { // If refreshed plan had only 1 step
                expect(mockObjective.plan.currentStepIndex).toBe(1); // Still becomes 1 (steps.length)
                expect(response.planStatus).toBe('completed'); // And plan is completed
                expect(response.message).toContain('Plan instance completed!');
            }
        });
    });
});
