const assert = require('node:assert'); // Using assert for simplicity, though Jest expect is also fine
const toolExecutorService = require('../../src/services/toolExecutorService');
// Path to config and dataStore will be relative to this test file if not mocked via Jest at top level

// --- Mocks ---
let mockFetchResponses = {};
global.fetch = jest.fn((url, options) => { // Replacing global fetch for this test file
    if (mockFetchResponses[url]) {
        const mockFn = mockFetchResponses[url];
        return Promise.resolve(mockFn(options));
    }
    return Promise.resolve({
        ok: false, status: 404,
        json: () => Promise.resolve({ error: 'Mocked Fetch: URL Not Found in toolExecutorService.test' }),
        text: () => Promise.resolve('Mocked Fetch: URL Not Found in toolExecutorService.test')
    });
});

let mockProject;
global.dataStore = {
    findProjectById: jest.fn(projectId => {
        if (mockProject && mockProject.id === projectId) {
            return mockProject;
        }
        return null;
    }),
    updateProjectById: jest.fn((projectId, updateData) => {
        if (mockProject && mockProject.id === projectId) {
            Object.assign(mockProject, updateData);
            return mockProject;
        }
        return null;
    })
};

// Mock config directly here for simplicity in this standalone test file setup
let mockConfig = {
    GEMINI_IMAGE_API_KEY: 'test-img-key',
    GEMINI_IMAGE_API_ENDPOINT: 'https://mock.gemini.image/api',
    VEO_API_KEY: 'test-veo-key',
    VEO_API_ENDPOINT: 'https://mock.veo.video/api',
    FACEBOOK_APP_ACCESS_TOKEN: 'test-fb-app-token',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'test-gads-dev-token',
    GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH: './fake_service_account.json',
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: 'gads-login-customer-123',
    // Add other config vars if toolExecutorService starts using them
};
jest.mock('../../src/config/config', () => mockConfig, { virtual: true });


// --- Test Suite ---
describe('Tool Executor Service Tests', () => {
    beforeEach(() => {
        mockFetchResponses = {};
        global.fetch.mockClear();
        global.dataStore.findProjectById.mockClear();
        // Restore any config that might be temporarily changed in a test
        mockConfig.GOOGLE_ADS_DEVELOPER_TOKEN = 'test-gads-dev-token';
        mockConfig.GOOGLE_ADS_SERVICE_ACCOUNT_KEY_PATH = './fake_service_account.json';
        mockConfig.GOOGLE_ADS_LOGIN_CUSTOMER_ID = 'gads-login-customer-123';
        mockConfig.FACEBOOK_APP_ACCESS_TOKEN = 'test-fb-app-token';


        mockProject = {
            id: 'project-123',
            name: 'Test Project',
            facebookPageAccessToken: 'fb-page-token-123',
            facebookSelectedPageID: 'fb-page-id-123',
            facebookUserAccessToken: 'fb-user-token-123',
            tiktokAccessToken: 'tiktok-token-123',
            assets: [
                { assetId: 'img1', type: 'image', url: 'http://assets.com/img1.jpg', name: 'Image 1' },
                { assetId: 'vid1', type: 'video', url: 'http://assets.com/vid1.mp4', name: 'Video 1' }
            ]
        };
    });

    // --- Facebook Managed Page Posts Search ---
    describe('execute_facebook_managed_page_posts_search', () => {
        const toolName = 'execute_facebook_managed_page_posts_search';
        it('should search managed page posts and return data', async () => {
            const params = { keywords: 'test query' };
            const expectedApiUrl = `https://graph.facebook.com/v18.0/${mockProject.facebookSelectedPageID}/posts?access_token=${mockProject.facebookPageAccessToken}&q=${encodeURIComponent(params.keywords)}`;
            mockFetchResponses[expectedApiUrl] = () => ({
                ok: true, status: 200, json: async () => ({ data: [{ id: 'post1', message: 'a post' }]})
            });

            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));

            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, undefined);
            expect(result.data[0].id).toBe('post1');
        });

        it('should return error if FB page token/ID missing', async () => {
            mockProject.facebookPageAccessToken = null;
            const result = JSON.parse(await toolExecutorService[toolName]({ keywords: 'q' }, mockProject.id));
            expect(result.error).toContain("Facebook Page access token or Page ID not configured");
        });
    });

    // --- Facebook Public Posts Search ---
    describe('execute_facebook_public_posts_search', () => {
        const toolName = 'execute_facebook_public_posts_search';
        it('should search public posts and return data', async () => {
            const params = { keywords: 'public query', targetPublicPageIdOrName: 'somepage' };
            const expectedApiUrl = `https://graph.facebook.com/v18.0/${params.targetPublicPageIdOrName}/posts?fields=id,message,from,created_time&access_token=${mockConfig.FACEBOOK_APP_ACCESS_TOKEN}&q=${encodeURIComponent(params.keywords)}`;
            mockFetchResponses[expectedApiUrl] = () => ({
                ok: true, status: 200, json: async () => ({ data: [{ id: 'pub_post_1', message: 'public post' }]})
            });
            mockProject.facebookUserAccessToken = null;

            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, undefined);
            expect(result.data[0].id).toBe('pub_post_1');
        });
         it('should return error if no access token available', async () => {
            mockProject.facebookUserAccessToken = null;
            const originalAppToken = mockConfig.FACEBOOK_APP_ACCESS_TOKEN;
            mockConfig.FACEBOOK_APP_ACCESS_TOKEN = '';
            const result = JSON.parse(await toolExecutorService[toolName]({ keywords: 'q' }, mockProject.id));
            expect(result.error).toContain("Facebook access token (user or app) not available");
            mockConfig.FACEBOOK_APP_ACCESS_TOKEN = originalAppToken; // Restore
        });
    });

    // --- TikTok Public Posts Search ---
    describe('execute_tiktok_public_posts_search', () => {
        const toolName = 'execute_tiktok_public_posts_search';
        it('should search TikTok posts and return data', async () => {
            const params = { keywordsOrHashtags: '#funny' };
            const expectedApiUrl = `https://api.tiktok.com/v2/research/video/query/?query=${encodeURIComponent(params.keywordsOrHashtags)}`;
             mockFetchResponses[expectedApiUrl] = () => ({
                ok: true, status: 200, json: async () => ({ data: { videos: [{ video_id: 'tiktok_1' }] } })
            });
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, undefined);
            expect(result.data.videos[0].video_id).toBe('tiktok_1');
        });
    });

    // --- Facebook Create Post ---
    describe('execute_facebook_create_post', () => {
        const toolName = 'execute_facebook_create_post';
        it('should create a text post on Facebook', async () => {
            const params = { text_content: 'Hello Facebook!' };
            const expectedApiUrl = `https://graph.facebook.com/v18.0/${mockProject.facebookSelectedPageID}/feed?access_token=${mockProject.facebookPageAccessToken}`;
            mockFetchResponses[expectedApiUrl] = (options) => {
                expect(JSON.parse(options.body).message).toBe(params.text_content);
                return { ok: true, status: 200, json: async () => ({ id: 'fb_post_123' }) };
            };
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.objectContaining({ method: 'POST' }));
            expect(result.id).toBe('fb_post_123');
        });

        it('should create a post with an image on Facebook', async () => {
            const params = { text_content: 'Check out this image!', image_asset_id: 'img1' };
            const expectedApiUrl = `https://graph.facebook.com/v18.0/${mockProject.facebookSelectedPageID}/photos?access_token=${mockProject.facebookPageAccessToken}`;
            mockFetchResponses[expectedApiUrl] = (options) => {
                expect(JSON.parse(options.body).message).toBe(params.text_content);
                expect(JSON.parse(options.body).url).toBe(mockProject.assets.find(a=>a.assetId === 'img1').url);
                return { ok: true, status: 200, json: async () => ({ id: 'fb_photo_post_123' }) };
            };
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.objectContaining({ method: 'POST' }));
            expect(result.id).toBe('fb_photo_post_123');
        });

        it('should return error if image asset not found', async () => {
            const params = { text_content: 'missing image', image_asset_id: 'nonexistentimg' };
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(result.error).toContain("Image asset nonexistentimg not found");
        });
    });

    // --- TikTok Create Post ---
    describe('execute_tiktok_create_post', () => {
        const toolName = 'execute_tiktok_create_post';
        it('should create a video post on TikTok', async () => {
            const params = { text_content: 'Cool TikTok video!', video_asset_id: 'vid1' };
            const expectedApiUrl = `https://api.tiktok.com/v2/post/publish/video/`;
            mockFetchResponses[expectedApiUrl] = (options) => {
                expect(JSON.parse(options.body).description).toBe(params.text_content);
                expect(JSON.parse(options.body).video_url).toBe(mockProject.assets.find(a=>a.assetId === 'vid1').url);
                return { ok: true, status: 200, json: async () => ({ data: { item_id: 'tiktok_post_123' } }) };
            };
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.objectContaining({ method: 'POST' }));
            expect(result.data.item_id).toBe('tiktok_post_123');
        });
         it('should return error if video asset not found', async () => {
            const params = { text_content: 'missing video', video_asset_id: 'nonexistentvid' };
            const result = JSON.parse(await toolExecutorService[toolName](params, mockProject.id));
            expect(result.error).toContain("Video asset nonexistentvid not found");
        });
    });

    // --- Google Ads Create Campaign From Config ---
    describe('execute_google_ads_create_campaign_from_config', () => {
        const toolName = 'execute_google_ads_create_campaign_from_config';
        const loginCustomerId = mockConfig.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
        const expectedApiUrl = `https://googleads.googleapis.com/vXX/customers/${loginCustomerId}/campaigns:mutate`;

        it('should successfully create a campaign with mock API call', async () => {
            const mockCampaignConfig = { campaignName: 'Test Campaign', campaignType: 'Search', customer_id: loginCustomerId }; // Ensure customer_id for API URL
            const mockBudget = '$50 daily';
            const mockApiResponse = { results: [{ resourceName: `customers/${loginCustomerId}/campaigns/mockCampaignId789` }] };

            mockFetchResponses[expectedApiUrl] = (options) => {
                expect(options.method).toBe('POST');
                expect(options.headers['Authorization']).toBe('Bearer mock-oauth-token-for-google-ads');
                expect(options.headers['developer-token']).toBe(mockConfig.GOOGLE_ADS_DEVELOPER_TOKEN);
                const body = JSON.parse(options.body);
                expect(body.campaignName).toBe(mockCampaignConfig.campaignName);
                expect(body.budget.amount_micros).toBe(50000000); // from "$50 daily"
                return { ok: true, status: 200, json: async () => mockApiResponse };
            };

            const result = JSON.parse(await toolExecutorService[toolName](mockCampaignConfig, mockBudget, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.anything());
            expect(result.results[0].resourceName).toContain('mockCampaignId789');
        });

        it('should return API error if fetch fails', async () => {
            const mockCampaignConfig = { campaignName: 'Test Campaign Error', customer_id: loginCustomerId };
            mockFetchResponses[expectedApiUrl] = () => ({
                ok: false, status: 500, text: async () => 'Internal Server Error'
            });
            const result = JSON.parse(await toolExecutorService[toolName](mockCampaignConfig, '$20', mockProject.id));
            expect(result.error).toContain('Failed to execute Google Ads campaign creation.'); // Error from catch block
        });

        it('should return config error if dev token is missing', async () => {
            const originalToken = mockConfig.GOOGLE_ADS_DEVELOPER_TOKEN;
            mockConfig.GOOGLE_ADS_DEVELOPER_TOKEN = ''; // Temporarily unset
            const result = JSON.parse(await toolExecutorService[toolName]({}, '$10', mockProject.id));
            expect(result.error).toContain("Google Ads developer token or service account key path not configured.");
            mockConfig.GOOGLE_ADS_DEVELOPER_TOKEN = originalToken; // Restore
        });
    });

    // --- Google Ads Create Ad Group From Config ---
    describe('execute_google_ads_create_ad_group_from_config', () => {
        const toolName = 'execute_google_ads_create_ad_group_from_config';
        const loginCustomerId = mockConfig.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
        const expectedApiUrl = `https://googleads.googleapis.com/vXX/customers/${loginCustomerId}/adGroups:mutate`;

        it('should successfully create an ad group', async () => {
            const mockAdGroupConfig = { adGroupName: 'Test AdGroup', campaign_id: 'campaign1', customer_id: loginCustomerId };
            const mockApiResponse = { results: [{ resourceName: `customers/${loginCustomerId}/adGroups/mockAdGroupId456` }] };
            mockFetchResponses[expectedApiUrl] = (options) => {
                expect(JSON.parse(options.body).adGroupName).toBe(mockAdGroupConfig.adGroupName);
                return { ok: true, status: 200, json: async () => mockApiResponse };
            };
            const result = JSON.parse(await toolExecutorService[toolName](mockAdGroupConfig, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.anything());
            expect(result.results[0].resourceName).toContain('mockAdGroupId456');
        });
    });

    // --- Google Ads Create Ad From Config ---
    describe('execute_google_ads_create_ad_from_config', () => {
        const toolName = 'execute_google_ads_create_ad_from_config';
        const loginCustomerId = mockConfig.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
        const expectedApiUrl = `https://googleads.googleapis.com/vXX/customers/${loginCustomerId}/adGroupAds:mutate`;

        it('should successfully create an ad', async () => {
            const mockAdConfig = { adName: 'Test Ad', ad_group_id: 'adGroup1', customer_id: loginCustomerId };
            const mockApiResponse = { results: [{ resourceName: `customers/${loginCustomerId}/ads/mockAdId789` }] };
            mockFetchResponses[expectedApiUrl] = (options) => {
                 expect(JSON.parse(options.body).adName).toBe(mockAdConfig.adName);
                return { ok: true, status: 200, json: async () => mockApiResponse };
            };
            const result = JSON.parse(await toolExecutorService[toolName](mockAdConfig, mockProject.id));
            expect(global.fetch).toHaveBeenCalledWith(expectedApiUrl, expect.anything());
            expect(result.results[0].resourceName).toContain('mockAdId789');
        });
    });
});
