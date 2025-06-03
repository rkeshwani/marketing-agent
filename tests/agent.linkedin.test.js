// tests/agent.linkedin.test.js
const agent = require('../../src/agent'); // Assuming agent.js exports getAgentResponse and initializeAgent
const dataStore = require('../../src/dataStore');
const toolExecutorService = require('../../src/services/toolExecutorService');
const geminiService = require('../../src/services/geminiService'); // For mocking Gemini responses

jest.mock('../../src/dataStore');
jest.mock('../../src/services/toolExecutorService');
jest.mock('../../src/services/geminiService');

// Mock global.dataStore if agent.js uses it directly for project access in executeTool
global.dataStore = dataStore;


describe('Agent LinkedIn Tool Handling', () => {
    const mockProjectId = 'project123';
    const mockObjectiveId = 'objective456';
    const mockUserId = 'urn:li:person:testLinkedInUser';
    const mockAccessToken = 'linkedInAccessTokenForTest';

    beforeEach(() => {
        dataStore.findProjectById.mockReset();
        dataStore.findObjectiveById.mockReset(); // If used by getAgentResponse directly
        toolExecutorService.execute_post_to_linkedin.mockReset();
        geminiService.fetchGeminiResponse.mockReset(); // For general agent responses
        geminiService.executePlanStep.mockReset(); // If testing plan execution flow
    });

    describe('executeTool dispatch for post_to_linkedin', () => {
        test('should call toolExecutorService.execute_post_to_linkedin with correct params when LinkedIn is connected', async () => {
            const mockProject = {
                id: mockProjectId,
                name: 'Test Project',
                linkedinAccessToken: mockAccessToken,
                linkedinUserID: mockUserId,
            };
            dataStore.findProjectById.mockReturnValue(mockProject);

            const toolArguments = { content: 'Test post content from agent' };

            // This is testing the internal executeTool function of agent.js
            // If executeTool is not directly exported, this test needs to be adapted
            // to trigger its usage via getAgentResponse and a mock Gemini tool_call.
            // For now, assuming direct testability or a refactor for it.

            // Simulating the scenario where executeTool is called internally
            // For this, we'd typically mock geminiService.executePlanStep to return a tool_call

            // Direct call to executeTool (if it were exported or testable this way)
            // await agent.executeTool('post_to_linkedin', toolArguments, mockProjectId);
            // expect(toolExecutorService.execute_post_to_linkedin).toHaveBeenCalledWith(
            //     {
            //         accessToken: mockAccessToken,
            //         userId: mockUserId,
            //         content: toolArguments.content,
            //     },
            //     mockProjectId
            // );

            // More realistic test via getAgentResponse:
            const mockObjective = {
                id: mockObjectiveId,
                projectId: mockProjectId,
                plan: { status: 'approved', currentStepIndex: 0, steps: ['Post to LinkedIn'] },
                chatHistory: [],
            };
            dataStore.findObjectiveById.mockReturnValue(mockObjective);
            geminiService.executePlanStep.mockResolvedValue({
                tool_call: { name: 'post_to_linkedin', arguments: toolArguments }
            });
            toolExecutorService.execute_post_to_linkedin.mockResolvedValue(JSON.stringify({ success: true, message: "Posted!"}));
            geminiService.fetchGeminiResponse.mockResolvedValue("Okay, I've posted that to LinkedIn for you.");


            await agent.getAgentResponse('User wants to post to LinkedIn', [], mockObjectiveId);

            expect(dataStore.findProjectById).toHaveBeenCalledWith(mockProjectId);
            expect(toolExecutorService.execute_post_to_linkedin).toHaveBeenCalledWith(
                {
                    accessToken: mockAccessToken,
                    userId: mockUserId,
                    content: toolArguments.content,
                },
                mockProjectId
            );
            // Also check if Gemini is called to summarize the tool output
            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledWith(
                expect.stringContaining("The tool post_to_linkedin was called"), // Context for summarization
                expect.any(Array), // Chat history
                expect.any(Array)  // Project assets
            );
        });

        test('should return error if LinkedIn is not connected for the project', async () => {
            const mockProject = { id: mockProjectId, name: 'Test Project Without LinkedIn' }; // No LinkedIn creds
            dataStore.findProjectById.mockReturnValue(mockProject);
            const toolArguments = { content: 'Test post content' };

            // Simulate Gemini deciding to use the tool
             const mockObjective = {
                id: mockObjectiveId,
                projectId: mockProjectId,
                plan: { status: 'approved', currentStepIndex: 0, steps: ['Post to LinkedIn'] },
                chatHistory: [],
            };
            dataStore.findObjectiveById.mockReturnValue(mockObjective);
            geminiService.executePlanStep.mockResolvedValue({
                tool_call: { name: 'post_to_linkedin', arguments: toolArguments }
            });
            // No mock for toolExecutorService.execute_post_to_linkedin as it shouldn't be called.
            geminiService.fetchGeminiResponse.mockResolvedValue("I couldn't post to LinkedIn because it's not connected.");


            const agentResponse = await agent.getAgentResponse('User wants to post to LinkedIn', [], mockObjectiveId);

            expect(dataStore.findProjectById).toHaveBeenCalledWith(mockProjectId);
            expect(toolExecutorService.execute_post_to_linkedin).not.toHaveBeenCalled();
            // The agent should get the error string from executeTool and pass it to Gemini for summarization
            expect(geminiService.fetchGeminiResponse).toHaveBeenCalledWith(
                expect.stringContaining("LinkedIn account not connected or credentials missing"),
                expect.any(Array),
                expect.any(Array)
            );
            expect(agentResponse).toBe("I couldn't post to LinkedIn because it's not connected.");
        });
    });
});
