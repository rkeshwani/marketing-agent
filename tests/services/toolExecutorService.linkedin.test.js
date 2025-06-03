// tests/services/toolExecutorService.linkedin.test.js
const toolExecutorService = require('../../src/services/toolExecutorService');
const linkedinService = require('../../src/services/linkedinService');

jest.mock('../../src/services/linkedinService'); // Mock the actual LinkedIn service

describe('ToolExecutorService - LinkedIn', () => {
    const mockProjectId = 'project-linkedintest';
    const mockParams = {
        accessToken: 'executorAccessToken',
        userId: 'urn:li:person:executorUser',
        content: 'Content from executor test',
    };

    beforeEach(() => {
        linkedinService.postToLinkedIn.mockReset();
    });

    describe('execute_post_to_linkedin', () => {
        test('should call linkedinService.postToLinkedIn and return success response', async () => {
            const mockServiceSuccessResponse = { success: true, data: { id: 'linkedInPostId123' } };
            linkedinService.postToLinkedIn.mockResolvedValue(mockServiceSuccessResponse);

            const resultString = await toolExecutorService.execute_post_to_linkedin(mockParams, mockProjectId);
            const result = JSON.parse(resultString);

            expect(linkedinService.postToLinkedIn).toHaveBeenCalledTimes(1);
            expect(linkedinService.postToLinkedIn).toHaveBeenCalledWith(
                mockParams.accessToken,
                mockParams.userId,
                mockParams.content
            );
            expect(result).toEqual({
                success: true,
                message: "Successfully posted to LinkedIn.",
                data: mockServiceSuccessResponse.data,
            });
        });

        test('should return error response if linkedinService.postToLinkedIn fails', async () => {
            const mockServiceError = new Error('LinkedIn API rejected the request');
            linkedinService.postToLinkedIn.mockRejectedValue(mockServiceError);

            const resultString = await toolExecutorService.execute_post_to_linkedin(mockParams, mockProjectId);
            const result = JSON.parse(resultString);

            expect(linkedinService.postToLinkedIn).toHaveBeenCalledTimes(1);
            expect(result.error).toContain('Failed to post to LinkedIn: LinkedIn API rejected the request');
        });

        test('should return error if linkedinService.postToLinkedIn returns a non-success object', async () => {
            const mockServiceErrorResponse = { success: false, error: "Service-level issue", data: { detail: "some detail"} };
            linkedinService.postToLinkedIn.mockResolvedValue(mockServiceErrorResponse); // Service returns error structure

            const resultString = await toolExecutorService.execute_post_to_linkedin(mockParams, mockProjectId);
            const result = JSON.parse(resultString);

            expect(linkedinService.postToLinkedIn).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                error: "Service-level issue",
                details: mockServiceErrorResponse.data
            });
        });

        test('should return error if essential parameters are missing', async () => {
            const incompleteParams = {
                accessToken: 'tokenOnly',
                // userId and content are missing
            };
            const resultString = await toolExecutorService.execute_post_to_linkedin(incompleteParams, mockProjectId);
            const result = JSON.parse(resultString);

            expect(linkedinService.postToLinkedIn).not.toHaveBeenCalled();
            expect(result.error).toBe("Missing accessToken, userId, or content for posting to LinkedIn.");
        });
    });
});
