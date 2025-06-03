// tests/services/linkedinService.test.js
const axios = require('axios');
const { postToLinkedIn } = require('../../src/services/linkedinService');

jest.mock('axios');

describe('linkedinService', () => {
    describe('postToLinkedIn', () => {
        const mockAccessToken = 'testAccessToken';
        const mockUserId = 'urn:li:person:testUserId';
        const mockPostContent = 'Hello LinkedIn!';
        const expectedApiUrl = 'https://api.linkedin.com/v2/ugcPosts';

        beforeEach(() => {
            // Reset mocks before each test
            axios.post.mockReset();
        });

        test('should make a successful post to LinkedIn', async () => {
            const mockApiResponse = { id: 'shareId', serviceErrorCode: 0 };
            axios.post.mockResolvedValue({ status: 201, data: mockApiResponse });

            const result = await postToLinkedIn(mockAccessToken, mockUserId, mockPostContent);

            expect(axios.post).toHaveBeenCalledTimes(1);
            expect(axios.post).toHaveBeenCalledWith(
                expectedApiUrl,
                {
                    author: mockUserId,
                    lifecycleState: 'PUBLISHED',
                    specificContent: {
                        'com.linkedin.ugc.ShareContent': {
                            shareCommentary: {
                                text: mockPostContent,
                            },
                            shareMediaCategory: 'NONE',
                        },
                    },
                    visibility: {
                        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
                    },
                },
                {
                    headers: {
                        'Authorization': `Bearer ${mockAccessToken}`,
                        'Content-Type': 'application/json',
                        'X-Restli-Protocol-Version': '2.0.0',
                    },
                }
            );
            expect(result).toEqual({ success: true, data: mockApiResponse });
        });

        test('should handle API error when posting to LinkedIn', async () => {
            const mockApiError = {
                response: {
                    status: 401,
                    data: { message: 'Unauthorized' },
                    headers: {},
                },
            };
            axios.post.mockRejectedValue(mockApiError);

            await expect(postToLinkedIn(mockAccessToken, mockUserId, mockPostContent))
                .rejects
                .toThrow(`LinkedIn API Error: 401 - ${JSON.stringify(mockApiError.response.data)}`);

            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        test('should handle network error when posting to LinkedIn', async () => {
            const networkError = new Error('Network error');
            networkError.request = {}; // Simulate a request error
            axios.post.mockRejectedValue(networkError);

            await expect(postToLinkedIn(mockAccessToken, mockUserId, mockPostContent))
                .rejects
                .toThrow('Error posting to LinkedIn: No response received from server.');
        });

        test('should handle unexpected error structure during API call', async () => {
            const genericError = new Error('Something weird happened');
            axios.post.mockRejectedValue(genericError);

            await expect(postToLinkedIn(mockAccessToken, mockUserId, mockPostContent))
                .rejects
                .toThrow('Error posting to LinkedIn: Something weird happened');
        });

        // Although the function itself doesn't currently have specific checks for missing params before API call,
        // testing how it behaves if they are null/undefined can be useful.
        // Axios might throw an error if headers are malformed due to missing accessToken.
        test('should ideally handle missing accessToken (current behavior may vary)', async () => {
            // Depending on how axios handles undefined in Bearer token, this might throw an error earlier
            // or result in an API error from LinkedIn.
            // For this test, let's assume it results in an API error due to missing auth.
            const mockApiError = {
                response: {
                    status: 401,
                    data: { message: 'Unauthorized - Token missing' },
                },
            };
            axios.post.mockRejectedValue(mockApiError);

            await expect(postToLinkedIn(null, mockUserId, mockPostContent))
                .rejects
                .toThrow('LinkedIn API Error: 401 - {"message":"Unauthorized - Token missing"}');
        });
         test('should ideally handle missing userId (current behavior may result in API error)', async () => {
            // LinkedIn API would likely reject a post with a null author.
            const mockApiError = {
                response: {
                    status: 400, // Bad Request
                    data: { message: 'Author cannot be null' },
                },
            };
            axios.post.mockRejectedValue(mockApiError);
            await expect(postToLinkedIn(mockAccessToken, null, mockPostContent))
                .rejects
                .toThrow('LinkedIn API Error: 400 - {"message":"Author cannot be null"}');
        });

        test('should ideally handle missing postContentText (current behavior may result in API error)', async () => {
            // LinkedIn API would likely reject a post with null text.
             const mockApiError = {
                response: {
                    status: 400, // Bad Request
                    data: { message: 'Share commentary text cannot be null' },
                },
            };
            axios.post.mockRejectedValue(mockApiError);
            await expect(postToLinkedIn(mockAccessToken, mockUserId, null))
                .rejects
                .toThrow('LinkedIn API Error: 400 - {"message":"Share commentary text cannot be null"}');
        });
    });
});
