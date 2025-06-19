// tests/server.wordpress.test.js
const request = require('supertest');
const app = require('../src/server'); // Import the app from the refactored server.js

// Mock services and datastore
// IMPORTANT: These mocks must be defined BEFORE 'app' is required if server.js uses them at the top level.
// However, since server.js defines routes within functions, this order is generally fine.
const mockWordpressService = {
    initWpapi: jest.fn(),
    storeCredentials: jest.fn(),
    createPost: jest.fn(),
    updatePostStatus: jest.fn(),
    fetchPosts: jest.fn(),
};
jest.mock('../src/services/wordpressService', () => mockWordpressService);

const mockDataStore = {
    findProjectById: jest.fn(),
    getWordpressCredentials: jest.fn(),
    findObjectiveById: jest.fn(),
    // No need to mock saveWordpressCredentials as it's called by wordpressService.storeCredentials
};
jest.mock('../src/dataStore', () => mockDataStore);


describe('WordPress Integration API Endpoints', () => {
    beforeEach(() => {
        // Clear all mock implementations and call history before each test
        jest.clearAllMocks();
    });

    describe('POST /api/projects/:projectId/wordpress-credentials', () => {
        it('should save credentials successfully and return 200', async () => {
            const projectId = 'project123';
            mockDataStore.findProjectById.mockReturnValue({ id: projectId, name: 'Test Project' });
            mockWordpressService.storeCredentials.mockResolvedValue(undefined); // storeCredentials doesn't return a value

            const res = await request(app)
                .post(`/api/projects/${projectId}/wordpress-credentials`)
                .send({ url: 'http://wp.example.com', username: 'wpuser', applicationPassword: 'password' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('WordPress credentials saved successfully.');
            expect(mockDataStore.findProjectById).toHaveBeenCalledWith(projectId);
            expect(mockWordpressService.storeCredentials).toHaveBeenCalledWith(projectId, 'http://wp.example.com', 'wpuser', 'password');
        });

        it('should return 404 if project not found', async () => {
            mockDataStore.findProjectById.mockReturnValue(null);
            const res = await request(app)
                .post('/api/projects/unknownProject/wordpress-credentials')
                .send({ url: 'http://wp.example.com', username: 'wpuser', applicationPassword: 'password' });

            expect(res.statusCode).toEqual(404);
            expect(res.body.error).toEqual('Project not found.');
        });

        it('should return 400 if required fields (url) are missing', async () => {
            const res = await request(app)
                .post('/api/projects/project123/wordpress-credentials')
                .send({ username: 'wpuser', applicationPassword: 'password' }); // Missing url
            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toContain('WordPress URL, username, and application password are required.');
        });

        it('should return 500 if storeCredentials throws an error', async () => {
            const projectId = 'project123';
            mockDataStore.findProjectById.mockReturnValue({ id: projectId, name: 'Test Project' });
            mockWordpressService.storeCredentials.mockRejectedValue(new Error('Service failure'));

            const res = await request(app)
                .post(`/api/projects/${projectId}/wordpress-credentials`)
                .send({ url: 'http://wp.example.com', username: 'wpuser', applicationPassword: 'password' });

            expect(res.statusCode).toEqual(500);
            expect(res.body.error).toEqual('Failed to save WordPress credentials.');
        });
    });

    describe('GET /api/projects/:projectId/wordpress-credentials', () => {
        it('should return credentials if found', async () => {
            const projectId = 'projectWithCreds';
            const creds = { url: 'http://wp.example.com', username: 'wpuser' }; // Password not sent
            mockDataStore.findProjectById.mockReturnValue({ id: projectId });
            mockDataStore.getWordpressCredentials.mockResolvedValue(creds);

            const res = await request(app).get(`/api/projects/${projectId}/wordpress-credentials`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(creds);
            expect(mockDataStore.getWordpressCredentials).toHaveBeenCalledWith(projectId);
        });

        it('should return a message if credentials are not set', async () => {
            const projectId = 'projectWithoutCreds';
            mockDataStore.findProjectById.mockReturnValue({ id: projectId });
            mockDataStore.getWordpressCredentials.mockResolvedValue(null);

            const res = await request(app).get(`/api/projects/${projectId}/wordpress-credentials`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('WordPress credentials not set for this project.');
        });

        it('should return 404 if project not found', async () => {
            mockDataStore.findProjectById.mockReturnValue(null);
            const res = await request(app).get('/api/projects/unknownProject/wordpress-credentials');
            expect(res.statusCode).toEqual(404);
        });
    });

    describe('POST /api/objectives/:objectiveId/wordpress/create-draft', () => {
        const objectiveId = 'objective1';
        const projectId = 'project1';
        const mockObjective = { id: objectiveId, projectId: projectId, title: 'Test Objective', brief: 'Brief', chatHistory: [] };
        const mockDraftPost = { id: 'wpPost123', link: 'http://wp.example.com/draft-post' };

        it('should create a draft successfully', async () => {
            mockDataStore.findObjectiveById.mockReturnValue(mockObjective);
            mockWordpressService.initWpapi.mockResolvedValue({}); // Non-null indicates success
            mockWordpressService.createPost.mockResolvedValue(mockDraftPost);

            const res = await request(app).post(`/api/objectives/${objectiveId}/wordpress/create-draft`);

            expect(res.statusCode).toEqual(201);
            expect(res.body.message).toEqual('WordPress draft created successfully by the agent.');
            expect(res.body.draftId).toEqual(mockDraftPost.id);
            expect(mockWordpressService.initWpapi).toHaveBeenCalledWith(projectId);
            expect(mockWordpressService.createPost).toHaveBeenCalled();
        });

        it('should return 404 if objective not found', async () => {
            mockDataStore.findObjectiveById.mockReturnValue(null);
            const res = await request(app).post('/api/objectives/unknownObjective/wordpress/create-draft');
            expect(res.statusCode).toEqual(404);
        });

        it('should return 400 if WordPress is not configured (initWpapi returns null)', async () => {
            mockDataStore.findObjectiveById.mockReturnValue(mockObjective);
            mockWordpressService.initWpapi.mockResolvedValue(null); // WP not configured

            const res = await request(app).post(`/api/objectives/${objectiveId}/wordpress/create-draft`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toEqual('WordPress is not configured for this project. Please set credentials first.');
        });

        it('should return 500 if createPost service fails', async () => {
            mockDataStore.findObjectiveById.mockReturnValue(mockObjective);
            mockWordpressService.initWpapi.mockResolvedValue({});
            mockWordpressService.createPost.mockRejectedValue(new Error('WP API Error'));

            const res = await request(app).post(`/api/objectives/${objectiveId}/wordpress/create-draft`);
            expect(res.statusCode).toEqual(500);
            expect(res.body.error).toEqual('WP API Error');
        });
    });

    describe('GET /api/projects/:projectId/wordpress/drafts', () => {
        const projectId = 'project1';
        const mockDrafts = [{id: 'd1', title:'Draft 1'}, {id: 'd2', title:'Draft 2'}];

        it('should fetch drafts successfully', async () => {
            mockWordpressService.initWpapi.mockResolvedValue({}); // WP configured
            mockWordpressService.fetchPosts.mockResolvedValue(mockDrafts);

            const res = await request(app).get(`/api/projects/${projectId}/wordpress/drafts`);
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(mockDrafts);
            expect(mockWordpressService.initWpapi).toHaveBeenCalledWith(projectId);
            expect(mockWordpressService.fetchPosts).toHaveBeenCalledWith({ status: 'draft', per_page: 20 });
        });

        it('should return 400 if WordPress is not configured', async () => {
            mockWordpressService.initWpapi.mockResolvedValue(null); // WP not configured
            const res = await request(app).get(`/api/projects/${projectId}/wordpress/drafts`);
            expect(res.statusCode).toEqual(400);
             expect(res.body.error).toEqual('WordPress is not configured for this project. Please set credentials first.');
        });

        it('should return 500 if fetchPosts service fails', async () => {
            mockWordpressService.initWpapi.mockResolvedValue({});
            mockWordpressService.fetchPosts.mockRejectedValue(new Error('Failed to fetch'));

            const res = await request(app).get(`/api/projects/${projectId}/wordpress/drafts`);
            expect(res.statusCode).toEqual(500);
            expect(res.body.error).toEqual('Failed to fetch');
        });
    });

    describe('POST /api/projects/:projectId/wordpress/drafts/:draftId/publish', () => {
        const projectId = 'project1';
        const draftId = 'draftToPublish';
        const mockPublishedPost = { id: draftId, link: 'http://wp.example.com/published-post', status: 'publish' };

        it('should publish a draft successfully', async () => {
            mockWordpressService.initWpapi.mockResolvedValue({}); // WP configured
            mockWordpressService.updatePostStatus.mockResolvedValue(mockPublishedPost);

            const res = await request(app).post(`/api/projects/${projectId}/wordpress/drafts/${draftId}/publish`);
            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('WordPress draft published successfully.');
            expect(res.body.postId).toEqual(draftId);
            expect(mockWordpressService.initWpapi).toHaveBeenCalledWith(projectId);
            expect(mockWordpressService.updatePostStatus).toHaveBeenCalledWith(draftId, 'publish');
        });

        it('should return 400 if WordPress is not configured', async () => {
            mockWordpressService.initWpapi.mockResolvedValue(null); // WP not configured
            const res = await request(app).post(`/api/projects/${projectId}/wordpress/drafts/${draftId}/publish`);
            expect(res.statusCode).toEqual(400);
            expect(res.body.error).toEqual('WordPress is not configured for this project. Please set credentials first.');
        });

        it('should return 500 if updatePostStatus service fails', async () => {
            mockWordpressService.initWpapi.mockResolvedValue({});
            mockWordpressService.updatePostStatus.mockRejectedValue(new Error('Publishing failed'));

            const res = await request(app).post(`/api/projects/${projectId}/wordpress/drafts/${draftId}/publish`);
            expect(res.statusCode).toEqual(500);
            expect(res.body.error).toEqual('Publishing failed');
        });
    });
});
