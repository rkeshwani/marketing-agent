// tests/tools/wordpressTool.test.js

// const WPAPI = require('wordpress-rest-api'); //This was duplicated
const dataStore = require('../../src/dataStore'); // Adjust path as needed
const {
    createWordPressDraft,
    publishWordPressDraft,
    createAndPublishWordPressPost,
} = require('../../src/tools/wordpressTool'); // Adjust path as needed

// Mock dataStore
jest.mock('../../src/dataStore');

// Manual mock for 'wordpress-rest-api' is in tests/tools/__mocks__/wordpress-rest-api.js
// Jest will automatically use it.
const WPAPI = require('wordpress-rest-api'); // This will be the mock constructor

describe('WordPress Tools', () => {
    let mockApiInstanceFromConstructor; // To store the instance returned by new WPAPI()
    let mockProject;

    beforeEach(() => {
        // Reset mocks before each test
        // WPAPI is the mock constructor. Clear its calls if you're testing how many times it's called.
        WPAPI.mockClear();
        dataStore.findProjectById.mockClear();

        // Get the shared instance from our manual mock to clear its method calls
        // This relies on the .mockInstance property we added to our manual mock.
        mockApiInstanceFromConstructor = WPAPI.mockInstance;
        mockApiInstanceFromConstructor.posts.mockClear();
        mockApiInstanceFromConstructor.create.mockClear();
        mockApiInstanceFromConstructor.id.mockClear();
        mockApiInstanceFromConstructor.update.mockClear();

        // Setup default mock project
        mockProject = {
            id: 'project-123',
            wordpressUrl: 'https://example.com',
            wordpressUsername: 'testuser',
            wordpressApplicationPassword: 'testpassword',
        };
        dataStore.findProjectById.mockReturnValue(mockProject);
    });

    describe('createWordPressDraft', () => {
        it('should create a draft post successfully', async () => {
            const draftData = { id: 1, title: 'Test Draft', content: 'Draft content', status: 'draft' };
            mockApiInstanceFromConstructor.create.mockResolvedValue(draftData);

            const result = await createWordPressDraft({
                projectId: 'project-123',
                title: 'Test Draft',
                content: 'Draft content',
            });

            expect(dataStore.findProjectById).toHaveBeenCalledWith('project-123');
            expect(WPAPI).toHaveBeenCalledWith({
                endpoint: 'https://example.com/wp-json', // Assuming /wp-json is appended
                username: 'testuser',
                password: 'testpassword',
                auth: true,
            });
            expect(mockApiInstanceFromConstructor.posts).toHaveBeenCalled();
            expect(mockApiInstanceFromConstructor.create).toHaveBeenCalledWith({
                title: 'Test Draft',
                content: 'Draft content',
                status: 'draft',
            });
            expect(result).toEqual(draftData);
        });

        it('should correctly use wordpressUrl if it already includes /wp-json', async () => {
            mockProject.wordpressUrl = 'https://custom.example.com/wp-json';
            dataStore.findProjectById.mockReturnValue(mockProject);
            mockApiInstanceFromConstructor.create.mockResolvedValue({ id: 2 });

            await createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' });
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'https://custom.example.com/wp-json',
            }));
        });


        it('should throw an error if project is not found', async () => {
            dataStore.findProjectById.mockReturnValue(null);
            await expect(createWordPressDraft({ projectId: 'unknown-project', title: 'T', content: 'C' }))
                .rejects.toThrow('Project not found: unknown-project');
        });

        it('should throw an error if WordPress credentials are not configured', async () => {
            dataStore.findProjectById.mockReturnValue({ id: 'project-no-wp-config' }); // No WP fields
            await expect(createWordPressDraft({ projectId: 'project-no-wp-config', title: 'T', content: 'C' }))
                .rejects.toThrow('WordPress integration is not configured for this project.');
        });

        it('should handle API errors during post creation', async () => {
            mockApiInstanceFromConstructor.create.mockRejectedValue(new Error('API Failure'));
            await expect(createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' }))
                .rejects.toThrow('Failed to create WordPress post: API Failure');
        });
    });

    describe('publishWordPressDraft', () => {
        it('should publish a draft successfully with new title and content', async () => {
            const publishedData = { id: 12, title: 'New Title', content: 'New Content', status: 'publish' };
            mockApiInstanceFromConstructor.update.mockResolvedValue(publishedData);

            const result = await publishWordPressDraft({
                projectId: 'project-123',
                postId: 12,
                title: 'New Title',
                content: 'New Content',
            });
            expect(mockApiInstanceFromConstructor.id).toHaveBeenCalledWith(12);
            expect(mockApiInstanceFromConstructor.update).toHaveBeenCalledWith({
                title: 'New Title',
                content: 'New Content',
                status: 'publish',
            });
            expect(result).toEqual(publishedData);
        });

        it('should publish a draft successfully without updating title or content', async () => {
            const publishedData = { id: 15, status: 'publish' };
            mockApiInstanceFromConstructor.update.mockResolvedValue(publishedData);

            const result = await publishWordPressDraft({
                projectId: 'project-123',
                postId: 15
            });
            expect(mockApiInstanceFromConstructor.id).toHaveBeenCalledWith(15);
            expect(mockApiInstanceFromConstructor.update).toHaveBeenCalledWith({
                status: 'publish', // Only status should be sent if title/content are not provided
            });
            expect(result).toEqual(publishedData);
        });


        it('should throw an error if postId is not provided', async () => {
            await expect(publishWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' }))
                .rejects.toThrow('WordPress Post ID is required to update a post.');
        });

        it('should handle API errors during post update', async () => {
            mockApiInstanceFromConstructor.update.mockRejectedValue(new Error('Update Failed'));
            await expect(publishWordPressDraft({ projectId: 'project-123', postId: 1, title: 'T', content: 'C' }))
                .rejects.toThrow('Failed to update WordPress post 1: Update Failed');
        });
    });

    describe('createAndPublishWordPressPost', () => {
        it('should create and publish a post successfully', async () => {
            const publishedData = { id: 3, title: 'Published Post', content: 'Published content', status: 'publish' };
            mockApiInstanceFromConstructor.create.mockResolvedValue(publishedData);

            const result = await createAndPublishWordPressPost({
                projectId: 'project-123',
                title: 'Published Post',
                content: 'Published content',
            });

            expect(mockApiInstanceFromConstructor.create).toHaveBeenCalledWith({
                title: 'Published Post',
                content: 'Published content',
                status: 'publish',
            });
            expect(result).toEqual(publishedData);
        });
    });

    // Add more tests for edge cases, different URL formats for wordpressUrl, etc.
    // For example, test the URL normalization (ensuring /wp-json is added correctly or not duplicated)
     describe('WordPress Client Initialization (getWordPressClient internal logic)', () => {
        it('should append /wp-json if wordpressUrl is a base URL', async () => {
            mockProject.wordpressUrl = 'https://blog.example.com';
            dataStore.findProjectById.mockReturnValue(mockProject);
            mockApiInstanceFromConstructor.create.mockResolvedValue({id:1});

            await createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' });
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'https://blog.example.com/wp-json',
            }));
        });

        it('should append /wp-json if wordpressUrl is a base URL with a trailing slash', async () => {
            mockProject.wordpressUrl = 'https://blog.example.com/';
            dataStore.findProjectById.mockReturnValue(mockProject);
            mockApiInstanceFromConstructor.create.mockResolvedValue({id:1});

            await createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' });
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'https://blog.example.com/wp-json',
            }));
        });

        it('should not append /wp-json if wordpressUrl already contains it', async () => {
            mockProject.wordpressUrl = 'https://blog.example.com/wp-json';
            dataStore.findProjectById.mockReturnValue(mockProject);
            mockApiInstanceFromConstructor.create.mockResolvedValue({id:1});

            await createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' });
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'https://blog.example.com/wp-json',
            }));
        });

        it('should not append /wp-json if wordpressUrl already contains it with a path', async () => {
            mockProject.wordpressUrl = 'https://blog.example.com/subfolder/wp-json';
            dataStore.findProjectById.mockReturnValue(mockProject);
            mockApiInstanceFromConstructor.create.mockResolvedValue({id:1});

            await createWordPressDraft({ projectId: 'project-123', title: 'T', content: 'C' });
            expect(WPAPI).toHaveBeenCalledWith(expect.objectContaining({
                endpoint: 'https://blog.example.com/subfolder/wp-json',
            }));
        });
    });
});
