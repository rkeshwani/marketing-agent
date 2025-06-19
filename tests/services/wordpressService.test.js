// tests/services/wordpressService.test.js

// Mock wpapi
const mockWpapiInstance = {
    posts: jest.fn().mockReturnThis(), // Allows chaining like .posts().create()
    create: jest.fn(),
    id: jest.fn().mockReturnThis(),   // Allows chaining like .posts().id().update()
    update: jest.fn(),
    param: jest.fn(), // Used by fetchPosts directly on .posts()
};
jest.mock('wpapi', () => {
    return jest.fn().mockImplementation(() => mockWpapiInstance);
});

// Mock ../dataStore
jest.mock('../../src/dataStore', () => ({ // Adjusted path: ../../src/dataStore from tests/services/
    getWordpressCredentials: jest.fn(),
    saveWordpressCredentials: jest.fn(),
}));

const WPAPI = require('wpapi'); // Get the mocked constructor
const dataStore = require('../../src/dataStore'); // Get the mocked dataStore
const wordpressService = require('../../src/services/wordpressService');

describe('wordpressService', () => {
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Reset specific mock implementations if they were changed in a test
        mockWpapiInstance.posts.mockReturnThis();
        mockWpapiInstance.id.mockReturnThis();
    });

    describe('initWpapi', () => {
        it('should initialize wpInstance and return it if credentials exist', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({
                url: 'http://example.com',
                username: 'user',
                applicationPassword: 'password'
            });
            const instance = await wordpressService.initWpapi('project1');
            expect(dataStore.getWordpressCredentials).toHaveBeenCalledWith('project1');
            expect(WPAPI).toHaveBeenCalledWith({
                endpoint: 'http://example.com/wp-json',
                username: 'user',
                password: 'password',
                auth: true
            });
            expect(instance).toBe(mockWpapiInstance);
        });

        it('should set wpInstance to null and return null if credentials do not exist', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue(null);
            const instance = await wordpressService.initWpapi('project1');
            expect(dataStore.getWordpressCredentials).toHaveBeenCalledWith('project1');
            expect(WPAPI).not.toHaveBeenCalled();
            expect(instance).toBeNull();
        });

        it('should set wpInstance to null and return null if credentials are incomplete', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com' }); // Incomplete
            const instance = await wordpressService.initWpapi('project1');
            expect(instance).toBeNull();
        });

        it('should set wpInstance to null and return null if projectId is not provided', async () => {
            const instance = await wordpressService.initWpapi(null);
            expect(dataStore.getWordpressCredentials).not.toHaveBeenCalled();
            expect(instance).toBeNull();
        });

        it('should correctly append /wp-json to URL not ending with a slash', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({
                url: 'http://example.com/site',
                username: 'user',
                applicationPassword: 'password'
            });
            await wordpressService.initWpapi('project1');
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'http://example.com/site/wp-json',
            }));
        });

        it('should correctly append wp-json to URL ending with a slash', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({
                url: 'http://example.com/site/',
                username: 'user',
                applicationPassword: 'password'
            });
            await wordpressService.initWpapi('project1');
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'http://example.com/site/wp-json',
            }));
        });
    });

    describe('getWpapiInstance', () => {
        it('should return a new WPAPI instance with correct parameters', () => {
            const instance = wordpressService.getWpapiInstance('http://new.com', 'newUser', 'newPass');
            expect(WPAPI).toHaveBeenCalledWith({
                endpoint: 'http://new.com/wp-json',
                username: 'newUser',
                password: 'newPass',
                auth: true
            });
            expect(instance).toBe(mockWpapiInstance);
        });

        it('should throw an error if URL is missing', () => {
            expect(() => wordpressService.getWpapiInstance(null, 'user', 'pass')).toThrow('WordPress URL, username, and application password are required.');
        });
        it('should throw an error if username is missing', () => {
            expect(() => wordpressService.getWpapiInstance('http://url.com', null, 'pass')).toThrow('WordPress URL, username, and application password are required.');
        });
        it('should throw an error if applicationPassword is missing', () => {
            expect(() => wordpressService.getWpapiInstance('http://url.com', 'user', null)).toThrow('WordPress URL, username, and application password are required.');
        });
    });

    describe('storeCredentials', () => {
        it('should call saveWordpressCredentials and then initWpapi', async () => {
            dataStore.saveWordpressCredentials.mockResolvedValue({}); // Assume save is successful
            dataStore.getWordpressCredentials.mockResolvedValue({ // For the subsequent initWpapi call
                url: 'http://example.com', username: 'user', applicationPassword: 'password'
            });

            const instance = await wordpressService.storeCredentials('project1', 'http://example.com', 'user', 'password');

            expect(dataStore.saveWordpressCredentials).toHaveBeenCalledWith('project1', {
                url: 'http://example.com',
                username: 'user',
                applicationPassword: 'password'
            });
            expect(dataStore.getWordpressCredentials).toHaveBeenCalledWith('project1'); // From initWpapi
            expect(instance).toBe(mockWpapiInstance); // initWpapi should return the instance
        });

        it('should throw an error if projectId is missing', async () => {
            await expect(wordpressService.storeCredentials(null, 'url', 'user', 'pass'))
                .rejects.toThrow('Project ID, URL, username, and application password are required to store credentials.');
        });
    });

    describe('createPost', () => {
        const postData = { title: 'Test Post', content: 'Test Content', status: 'draft' };

        it('should create a post using the global wpInstance if initialized', async () => {
            // First, initialize the global wpInstance
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            mockWpapiInstance.create.mockResolvedValue({ id: 123, ...postData }); // Mock the create call

            const result = await wordpressService.createPost(postData);
            expect(mockWpapiInstance.posts).toHaveBeenCalledTimes(1);
            expect(mockWpapiInstance.create).toHaveBeenCalledWith(postData);
            expect(result).toEqual({ id: 123, ...postData });
        });

        it('should create a post using a passed apiInstance', async () => {
            const customInstance = { posts: jest.fn().mockReturnThis(), create: jest.fn().mockResolvedValue({ id: 456, ...postData }) };
            const result = await wordpressService.createPost(postData, customInstance);
            expect(customInstance.posts).toHaveBeenCalledTimes(1);
            expect(customInstance.create).toHaveBeenCalledWith(postData);
            expect(result).toEqual({ id: 456, ...postData });
            expect(mockWpapiInstance.create).not.toHaveBeenCalled(); // Ensure global not used
        });

        it('should throw error if wpInstance is not initialized and no apiInstance passed', async () => {
            // Ensure global wpInstance is null (e.g. by calling initWpapi with no creds)
            dataStore.getWordpressCredentials.mockResolvedValue(null);
            await wordpressService.initWpapi('project1'); // This will set global wpInstance to null

            await expect(wordpressService.createPost(postData))
                .rejects.toThrow('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
        });

        it('should throw error if title is missing', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            await expect(wordpressService.createPost({ content: 'Content' }))
                .rejects.toThrow('Post title and content are required.');
        });

        it('should throw error if content is missing', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            await expect(wordpressService.createPost({ title: 'Title' }))
                .rejects.toThrow('Post title and content are required.');
        });

        it('should handle WP API errors during post creation', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            const apiError = new Error("API Error");
            apiError.data = { message: "WordPress specific error message" };
            mockWpapiInstance.create.mockRejectedValue(apiError);

            await expect(wordpressService.createPost(postData))
                .rejects.toThrow('WordPress API Error: WordPress specific error message');
        });
    });

    describe('updatePostStatus', () => {
        const postId = 123;
        const newStatus = 'publish';

        it('should update post status using global wpInstance', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            mockWpapiInstance.update.mockResolvedValue({ id: postId, status: newStatus });

            const result = await wordpressService.updatePostStatus(postId, newStatus);
            expect(mockWpapiInstance.posts).toHaveBeenCalledTimes(1);
            expect(mockWpapiInstance.id).toHaveBeenCalledWith(postId);
            expect(mockWpapiInstance.update).toHaveBeenCalledWith({ status: newStatus });
            expect(result).toEqual({ id: postId, status: newStatus });
        });

        it('should update post status using passed apiInstance', async () => {
            const customInstance = { posts: jest.fn().mockReturnThis(), id: jest.fn().mockReturnThis(), update: jest.fn().mockResolvedValue({ id: postId, status: newStatus }) };
            const result = await wordpressService.updatePostStatus(postId, newStatus, customInstance);
            expect(customInstance.posts).toHaveBeenCalledTimes(1);
            expect(customInstance.id).toHaveBeenCalledWith(postId);
            expect(customInstance.update).toHaveBeenCalledWith({ status: newStatus });
            expect(result).toEqual({ id: postId, status: newStatus });
        });

        it('should throw error if wpInstance not initialized (global)', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue(null);
            await wordpressService.initWpapi('project1'); // Sets global wpInstance to null
            await expect(wordpressService.updatePostStatus(postId, newStatus))
                .rejects.toThrow('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
        });

        it('should throw error if postId or status is missing', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            await expect(wordpressService.updatePostStatus(null, newStatus)).rejects.toThrow('Post ID and new status are required.');
            await expect(wordpressService.updatePostStatus(postId, null)).rejects.toThrow('Post ID and new status are required.');
        });
    });

    describe('fetchPosts', () => {
        const mockFetchedPosts = [{ id: 1, title: 'Draft 1' }, { id: 2, title: 'Draft 2' }];

        it('should fetch posts with default params using global wpInstance', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            mockWpapiInstance.param.mockResolvedValue(mockFetchedPosts);

            const result = await wordpressService.fetchPosts();
            expect(mockWpapiInstance.posts).toHaveBeenCalledTimes(1);
            expect(mockWpapiInstance.param).toHaveBeenCalledWith({ per_page: 10, status: 'draft' });
            expect(result).toEqual(mockFetchedPosts);
        });

        it('should fetch posts with custom params using passed apiInstance', async () => {
            const customParams = { status: 'publish', per_page: 5 };
            const customInstance = { posts: jest.fn().mockReturnThis(), param: jest.fn().mockResolvedValue(mockFetchedPosts) };

            const result = await wordpressService.fetchPosts(customParams, customInstance);
            expect(customInstance.posts).toHaveBeenCalledTimes(1);
            expect(customInstance.param).toHaveBeenCalledWith(customParams);
            expect(result).toEqual(mockFetchedPosts);
        });

        it('should throw error if wpInstance not initialized (global)', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue(null);
            await wordpressService.initWpapi('project1'); // Sets global wpInstance to null
            await expect(wordpressService.fetchPosts())
                .rejects.toThrow('WPAPI instance is not initialized. Call initWpapi(projectId) first or pass an apiInstance.');
        });

        it('should merge default status with provided params if status is not in params', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            mockWpapiInstance.param.mockResolvedValue(mockFetchedPosts);

            await wordpressService.fetchPosts({ per_page: 5, orderby: 'title' });
            expect(mockWpapiInstance.param).toHaveBeenCalledWith({ status: 'draft', per_page: 5, orderby: 'title' });
        });

         it('should override default status if status is in params', async () => {
            dataStore.getWordpressCredentials.mockResolvedValue({ url: 'http://example.com', username: 'user', applicationPassword: 'password' });
            await wordpressService.initWpapi('project1');
            mockWpapiInstance.param.mockResolvedValue(mockFetchedPosts);

            await wordpressService.fetchPosts({ status: 'publish', per_page: 5 });
            expect(mockWpapiInstance.param).toHaveBeenCalledWith({ status: 'publish', per_page: 5 });
        });
    });
});
