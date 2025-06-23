// tests/services/geminiService.test.js
const geminiService = require('../../src/services/geminiService');
const Objective = require('../../src/models/Objective'); // To create objective instances
const config = require('../../src/config/config'); // To get GEMINI_API_ENDPOINT

// Mock axios for API calls
const axios = require('axios');
jest.mock('axios', () => ({
    // ...jest.requireActual('axios'), // if you want to spread the actual module and overwrite some parts
    post: jest.fn(),
    get: jest.fn(), // Mock other methods if used by geminiService or other tested services
    // default: jest.fn().mockImplementation(() => ({ // if axios is used as a function axios(...)
    //   post: jest.fn(),
    //   get: jest.fn(),
    // })),
}));

// We are now testing the actual geminiService, not mocking it.
// Specific functions within geminiService that call external services (like axios.post) will be tested
// by controlling the mock of that external service.


describe('GeminiService', () => {
    describe('generatePlanForObjective', () => {
        let mockObjective;
        const projectAssets = [{ name: 'Asset1', type: 'image', tags: ['tag1'] }];

        beforeEach(() => {
            axios.post.mockReset();
            mockObjective = new Objective('proj1', 'Test Objective', 'Initial brief');
            // Mock the API call that will be made by fetchGeminiResponse
            // Now generatePlanForObjective will always call fetchGeminiResponse, which calls axios.post
            axios.post.mockResolvedValue({
                data: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: "PLAN:\n- Step 1: Mocked plan step.\n- Step 2: Another mocked step.\nQUESTIONS:\n- Mocked question 1?\n- Mocked question 2?"
                            }]
                        }
                    }]
                }
            });
        });

        // afterEach can be removed or modified if specific checks per test are needed.
        // The previous afterEach checking for axios.post NOT to be called is no longer valid.

        test('should include previousPostSummary in prompt if context exists', async () => {
            mockObjective.currentRecurrenceContext = { previousPostSummary: 'Last time we did X.' };
            mockObjective.isRecurring = true; // Important for context to be used

            const result = await geminiService.generatePlanForObjective(mockObjective, projectAssets);
            expect(axios.post).toHaveBeenCalledTimes(1); // Verify API call was made
            // Check that the prompt sent to the API (via fetchGeminiResponse) contains the summary
            const sentPrompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(sentPrompt).toContain("The summary of the last completed instance was: \"Last time we did X.\"");
            expect(result.planSteps.length).toBeGreaterThan(0);
        });

        test('should use specific prompt for first run of a recurring task (no originalPlan)', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = null; // Explicitly null for this test case

            const result = await geminiService.generatePlanForObjective(mockObjective, projectAssets);
            expect(axios.post).toHaveBeenCalledTimes(1);
            const sentPrompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(sentPrompt).toContain("This is the first time setting up a recurring task.");
            expect(result.planSteps.length).toBeGreaterThan(0);
        });

        test('should use standard prompt for non-recurring objectives', async () => {
            mockObjective.isRecurring = false;
            const result = await geminiService.generatePlanForObjective(mockObjective, projectAssets);
            expect(axios.post).toHaveBeenCalledTimes(1);
            const sentPrompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(sentPrompt).not.toContain("The summary of the last completed instance was:");
            expect(sentPrompt).not.toContain("This is the first time setting up a recurring task.");
            expect(result.planSteps.length).toBeGreaterThan(0);
        });

        test('should use standard prompt if recurring but no context and originalPlan exists', async () => {
            mockObjective.isRecurring = true;
            mockObjective.originalPlan = { steps: ['some step'], questions: [] }; // originalPlan exists
            mockObjective.currentRecurrenceContext = null; // No context

            const result = await geminiService.generatePlanForObjective(mockObjective, projectAssets);
            expect(axios.post).toHaveBeenCalledTimes(1);
            // This scenario should also not include the "first run" or "previous summary" decorators
            const sentPrompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(sentPrompt).not.toContain("The summary of the last completed instance was:");
            expect(sentPrompt).not.toContain("This is the first time setting up a recurring task.");
            expect(result.planSteps.length).toBeGreaterThan(0);
        });

        test('should parse plan steps and questions correctly from mocked API response', async () => {
            // The beforeEach already sets up a mock response.
            // We can override it here if a specific format for this test is needed,
            // or rely on the default one from beforeEach.
            // For this test, the default mock from beforeEach is fine.
            mockObjective.title = "Test Objective From Mock"; // Ensure title is used in prompt generation

            const { planSteps, questions } = await geminiService.generatePlanForObjective(mockObjective, []);

            expect(axios.post).toHaveBeenCalledTimes(1);
            const sentPrompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(sentPrompt).toContain(`Title: "Test Objective From Mock"`); // Check title in prompt
            expect(sentPrompt).toContain(`Contextual Brief:`); // Check brief part of prompt
            expect(sentPrompt).toContain(`AVAILABLE_ASSETS:\nNo assets available.`);


            expect(planSteps).toEqual([
                'Step 1: Mocked plan step.',
                'Step 2: Another mocked step.'
            ]);
            expect(questions).toEqual([
                'Mocked question 1?',
                'Mocked question 2?'
            ]);
        });

        test('should handle "QUESTIONS: None" correctly if API mock produces it', async () => {
            axios.post.mockResolvedValueOnce({ // Override beforeEach mock for this specific test. Use mockResolvedValueOnce.
                data: {
                    candidates: [{
                        content: {
                            parts: [{
                                text: "PLAN:\n- Step A: Do this.\nQUESTIONS: None"
                            }]
                        }
                    }]
                }
            });
            const { planSteps, questions } = await geminiService.generatePlanForObjective(mockObjective, []);
            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(planSteps).toEqual(['Step A: Do this.']);
            expect(questions).toEqual([]);
        });
    });

    describe('fetchGeminiResponse', () => {
        const mockUserInput = 'Test input';
        const mockChatHistory = [{ role: 'user', parts: [{ text: 'Previous message' }] }];
        const mockProjectAssets = [{ name: 'asset.png', type: 'image/png' }];
        // Assuming getAllToolSchemas is available and returns a known set of tools
        // If toolRegistryService is complex, it might need its own mock.
        // For now, assume it's simple or its actual implementation is fine for these tests.
        const { getAllToolSchemas } = require('../../src/services/toolRegistryService');


        beforeEach(() => {
            axios.post.mockReset();
            // Provide a default GEMINI_API_KEY and GEMINI_API_ENDPOINT if not set in actual config
            // This is important because fetchGeminiResponse will throw an error if they are missing.
            if (!config.GEMINI_API_KEY) {
                config.GEMINI_API_KEY = 'test_api_key';
            }
            if (!config.GEMINI_API_ENDPOINT) {
                config.GEMINI_API_ENDPOINT = 'http://fakegemini.com/api';
            }
        });

        test('should return text response from API', async () => {
            const apiTextResponse = 'Hello from API';
            axios.post.mockResolvedValueOnce({
                data: {
                    candidates: [{ content: { parts: [{ text: apiTextResponse }] } }]
                }
            });

            const result = await geminiService.fetchGeminiResponse(mockUserInput, mockChatHistory, mockProjectAssets);
            expect(result).toBe(apiTextResponse);
            expect(axios.post).toHaveBeenCalledTimes(1);
            const expectedUrl = `${config.GEMINI_API_ENDPOINT}:generateContent?key=${config.GEMINI_API_KEY}`;
            expect(axios.post).toHaveBeenCalledWith(
                expectedUrl,
                expect.objectContaining({
                    contents: expect.arrayContaining([
                        ...mockChatHistory,
                        expect.objectContaining({ role: 'user', parts: [{ text: expect.stringContaining(mockUserInput) }] })
                    ]),
                    tools: [{ functionDeclarations: getAllToolSchemas() }]
                }),
                { headers: { 'Content-Type': 'application/json' } } // Authorization header removed
            );
        });

        test('should return tool_call response from API', async () => {
            const apiToolCallResponse = { name: 'some_tool', arguments: { arg1: 'value1' } };
            axios.post.mockResolvedValueOnce({
                data: {
                    candidates: [{ content: { parts: [{ tool_call: apiToolCallResponse }] } }]
                }
            });

            const result = await geminiService.fetchGeminiResponse(mockUserInput, mockChatHistory, mockProjectAssets);
            expect(result).toEqual(apiToolCallResponse);
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should throw error if API call fails', async () => {
            axios.post.mockRejectedValueOnce(new Error('API Error'));
            await expect(geminiService.fetchGeminiResponse(mockUserInput, mockChatHistory, mockProjectAssets))
                .rejects
                .toThrow('Gemini API call failed: API Error');
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        // Removed obsolete test: 'should return hardcoded plan for "Based on the following marketing objective:" prompt'
        // This specific path in fetchGeminiResponse was removed. Plan generation is now handled by generatePlanForObjective.

        test('should throw error if API key or endpoint is missing', async () => {
            const originalApiKey = config.GEMINI_API_KEY;
            const originalApiEndpoint = config.GEMINI_API_ENDPOINT;

            config.GEMINI_API_KEY = null;
            await expect(geminiService.fetchGeminiResponse(mockUserInput, [], []))
                .rejects
                .toThrow('Gemini API Key or Endpoint is not configured.');

            config.GEMINI_API_KEY = originalApiKey; // restore
            config.GEMINI_API_ENDPOINT = null;
            await expect(geminiService.fetchGeminiResponse(mockUserInput, [], []))
                .rejects
                .toThrow('Gemini API Key or Endpoint is not configured.');

            config.GEMINI_API_ENDPOINT = originalApiEndpoint; // restore
            expect(axios.post).not.toHaveBeenCalled();
        });
    });

    describe('generateProjectContextQuestions', () => {
        beforeEach(() => {
            axios.post.mockReset();
            if (!config.GEMINI_API_KEY) config.GEMINI_API_KEY = 'test_api_key';
            if (!config.GEMINI_API_ENDPOINT) config.GEMINI_API_ENDPOINT = 'http://fakegemini.com/api';
        });

        test('should return parsed questions from API response', async () => {
            const mockQuestions = ["Question 1?", "Question 2?"];
            const apiResponseText = JSON.stringify(mockQuestions);
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: apiResponseText }] } }] }
            });

            const result = await geminiService.generateProjectContextQuestions('Test Project', 'Description');
            expect(result).toEqual(mockQuestions);
            expect(axios.post).toHaveBeenCalledTimes(1);
            const prompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(prompt).toContain('Return ONLY a JSON string array of the questions.');
        });

        test('should return default questions if API response is not valid JSON', async () => {
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: 'Not a JSON array' }] } }] }
            });
            const result = await geminiService.generateProjectContextQuestions('Test Project', 'Description');
            expect(result).toEqual(["Error parsing questions from AI.", "What is the primary goal of this project?"]); // Matches error handling in geminiService.js
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should return default questions if API returns tool_call instead of text', async () => {
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ tool_call: { name: "some_tool" } }] } }] }
            });
            const result = await geminiService.generateProjectContextQuestions('Test Project', 'Description');
            expect(result).toEqual(["Unexpected response type from AI.", "Please clarify project objectives."]);
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should correctly parse questions from markdown code block', async () => {
            const mockQuestions = ["Question from markdown?"];
            const markdownResponse = "```json\n" + JSON.stringify(mockQuestions) + "\n```";
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: markdownResponse }] } }] }
            });
            const result = await geminiService.generateProjectContextQuestions('Test Project', 'Description');
            expect(result).toEqual(mockQuestions);
        });

        test('should correctly parse questions from simple markdown code block', async () => {
            const mockQuestions = ["Another question?"];
            const markdownResponse = "```\n" + JSON.stringify(mockQuestions) + "\n```";
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: markdownResponse }] } }] }
            });
            const result = await geminiService.generateProjectContextQuestions('Test Project', 'Description');
            expect(result).toEqual(mockQuestions);
        });
    });

    describe('structureProjectContextAnswers', () => {
        beforeEach(() => {
            axios.post.mockReset();
            if (!config.GEMINI_API_KEY) config.GEMINI_API_KEY = 'test_api_key';
            if (!config.GEMINI_API_ENDPOINT) config.GEMINI_API_ENDPOINT = 'http://fakegemini.com/api';
        });

        test('should return parsed object from API response', async () => {
            const mockContext = { key: "value", brandIdentity: "test" };
            const apiResponseText = JSON.stringify(mockContext);
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: apiResponseText }] } }] }
            });

            const result = await geminiService.structureProjectContextAnswers('Test Project', 'Description', 'Answers');
            expect(result).toEqual(mockContext);
            expect(axios.post).toHaveBeenCalledTimes(1);
            const prompt = axios.post.mock.calls[0][1].contents.find(c => c.role === 'user').parts[0].text;
            expect(prompt).toContain('Return ONLY the JSON object.');
        });

        test('should return error object if API response is not valid JSON', async () => {
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: 'Not a JSON object' }] } }] }
            });
            const result = await geminiService.structureProjectContextAnswers('Test Project', 'Description', 'Answers');
            expect(result).toEqual({ error: "Failed to structure project context.", details: "Error parsing JSON response from AI." });
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should return error object if API returns tool_call instead of text', async () => {
             axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ tool_call: { name: "some_tool" } }] } }] }
            });
            const result = await geminiService.structureProjectContextAnswers('Test Project', 'Description', 'Answers');
            expect(result).toEqual({ error: "Failed to structure project context.", details: "Unexpected response type from AI." });
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should correctly parse context from markdown code block', async () => {
            const mockContext = { item: "data from markdown" };
            const markdownResponse = "```json\n" + JSON.stringify(mockContext) + "\n```";
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: markdownResponse }] } }] }
            });
            const result = await geminiService.structureProjectContextAnswers('Test Project', 'Description', 'Answers');
            expect(result).toEqual(mockContext);
        });

        test('should correctly parse context from simple markdown code block', async () => {
            const mockContext = { another: "data" };
            const markdownResponse = "```\n" + JSON.stringify(mockContext) + "\n```";
            axios.post.mockResolvedValueOnce({
                data: { candidates: [{ content: { parts: [{ text: markdownResponse }] } }] }
            });
            const result = await geminiService.structureProjectContextAnswers('Test Project', 'Description', 'Answers');
            expect(result).toEqual(mockContext);
        });
    });
});
