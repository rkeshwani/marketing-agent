// tests/providers/cosmosDbStore.test.js
const CosmosDbStore = require('../../src/providers/CosmosDbStore');
const Project = require('../../src/models/Project');
const Objective = require('../../src/models/Objective');
const { CosmosClient } = require('@azure/cosmos');

// Mock the Azure Cosmos DB client
jest.mock('@azure/cosmos');

describe('CosmosDbStore.js', () => {
    let store;
    let mockCosmosClientInstance;
    let mockDatabaseInstance;
    let mockContainerInstance;
    let mockItemsInstance;

    const MOCK_ENDPOINT = 'https://test-account.documents.azure.com:443/';
    const MOCK_KEY = 'test-key';
    const MOCK_DB_ID = 'testDb';
    const MOCK_PROJECTS_CONTAINER_ID = 'TestProjects';
    const MOCK_OBJECTIVES_CONTAINER_ID = 'TestObjectives';

    beforeEach(() => {
        // Mock items operations
        mockItemsInstance = {
            create: jest.fn().mockResolvedValue({ resource: { id: 'new-id' } }), // Simulate item creation
            readAll: jest.fn().mockReturnThis(),
            fetchAll: jest.fn().mockResolvedValue({ resources: [] }),
            query: jest.fn().mockReturnThis(), // For chaining fetchAll
            // item(id, partitionKey) returns an object with read, replace, delete
            item: jest.fn().mockImplementation((id, partitionKey) => ({
                read: jest.fn().mockResolvedValue({ resource: null }), // Default to not found
                replace: jest.fn().mockResolvedValue({ resource: { id } }),
                delete: jest.fn().mockResolvedValue({})
            })),
        };

        // Mock container
        mockContainerInstance = {
            items: mockItemsInstance,
            id: '', // Will be set based on projects or objectives
        };

        // Mock database
        mockDatabaseInstance = {
            containers: {
                createIfNotExists: jest.fn().mockImplementation(async (containerDef) => {
                    let containerId = containerDef.id;
                    let mockSpecificContainer = { ...mockContainerInstance, id: containerId };
                    if (containerId === MOCK_PROJECTS_CONTAINER_ID) {
                         // Further specific mocks for projects container if needed
                    } else if (containerId === MOCK_OBJECTIVES_CONTAINER_ID) {
                        // Further specific mocks for objectives container
                    }
                    return { container: mockSpecificContainer, resource: { id: containerId } };
                }),
            },
            id: MOCK_DB_ID,
        };

        // Mock CosmosClient
        mockCosmosClientInstance = {
            databases: {
                createIfNotExists: jest.fn().mockResolvedValue({ database: mockDatabaseInstance, resource: { id: MOCK_DB_ID } }),
            },
        };

        CosmosClient.mockImplementation(() => mockCosmosClientInstance);

        store = new CosmosDbStore(MOCK_ENDPOINT, MOCK_KEY, MOCK_DB_ID, MOCK_PROJECTS_CONTAINER_ID, MOCK_OBJECTIVES_CONTAINER_ID);

        expect(CosmosClient).toHaveBeenCalledWith({ endpoint: MOCK_ENDPOINT, key: MOCK_KEY });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization (_initialize)', () => {
        test('should create database and containers if they do not exist', async () => {
            await store._initialize(); // Call explicitly for test clarity

            expect(mockCosmosClientInstance.databases.createIfNotExists).toHaveBeenCalledWith({ id: MOCK_DB_ID });
            expect(mockDatabaseInstance.containers.createIfNotExists).toHaveBeenCalledWith({
                id: MOCK_PROJECTS_CONTAINER_ID,
                partitionKey: { paths: ['/id'] }
            });
            expect(mockDatabaseInstance.containers.createIfNotExists).toHaveBeenCalledWith({
                id: MOCK_OBJECTIVES_CONTAINER_ID,
                partitionKey: { paths: ['/projectId'] }
            });
            expect(store.database).toBe(mockDatabaseInstance);
            expect(store.projectsContainer.id).toBe(MOCK_PROJECTS_CONTAINER_ID);
            expect(store.objectivesContainer.id).toBe(MOCK_OBJECTIVES_CONTAINER_ID);
        });
    });

    describe('Project Operations', () => {
        const projectData = { name: 'Cosmos Project', description: 'A test project' };
        let projectInstance;

        beforeEach(async () => {
            projectInstance = new Project(projectData.name, projectData.description);
            // Ensure store is initialized for each project operation test
            await store._initialize();
        });

        test('addProject should create an item in the projects container', async () => {
            const mockCreatedItem = { ...projectInstance, id: projectInstance.id }; // Cosmos returns the created item
            mockItemsInstance.create.mockResolvedValueOnce({ resource: mockCreatedItem });

            const result = await store.addProject(projectData);

            expect(mockItemsInstance.create).toHaveBeenCalledTimes(1);
            const callArg = mockItemsInstance.create.mock.calls[0][0];
            expect(callArg.name).toBe(projectData.name);
            expect(callArg.id).toBe(result.id); // Project model generates ID
            expect(typeof callArg.createdAt).toBe('string'); // ISO String

            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe(projectData.name);
        });

        test('getAllProjects should read all items from projects container', async () => {
            const projectItem1 = { id: 'p1', name: 'P1', description: 'D1', createdAt: new Date().toISOString() };
            mockItemsInstance.fetchAll.mockResolvedValueOnce({ resources: [projectItem1] });

            const results = await store.getAllProjects();
            expect(mockItemsInstance.readAll).toHaveBeenCalledTimes(1);
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('P1');
        });

        test('findProjectById should read an item by ID (which is also partitionKey)', async () => {
            const projectId = 'uniqueProjectId';
            const projectItem = { id: projectId, name: 'Found Project', createdAt: new Date().toISOString() };

            // Mock the specific item().read() call
            const mockItemRead = jest.fn().mockResolvedValue({ resource: projectItem });
            store.projectsContainer.items.item = jest.fn().mockReturnValue({ read: mockItemRead });

            const result = await store.findProjectById(projectId);

            expect(store.projectsContainer.items.item).toHaveBeenCalledWith(projectId, projectId);
            expect(mockItemRead).toHaveBeenCalledTimes(1);
            expect(result.name).toBe('Found Project');
        });

         test('findProjectById should return null if project not found', async () => {
            const mockItemRead = jest.fn().mockResolvedValue({ resource: null }); // Simulate not found
            store.projectsContainer.items.item = jest.fn().mockReturnValue({ read: mockItemRead });

            const result = await store.findProjectById('nonExistentId');
            expect(result).toBeNull();
        });

        test('updateProjectById should replace an item', async () => {
            const projectId = 'projToUpdate';
            const originalItem = new Project('Original', 'Desc');
            originalItem.id = projectId;
            const updatePayload = { name: 'Updated Name' };
            const expectedReplacedItem = { ...originalItem, ...updatePayload, updatedAt: new Date().toISOString(), id: projectId };

            // Mock findProjectById first
            const mockFindRead = jest.fn().mockResolvedValue({ resource: store._toCosmosItem(originalItem) });
            const mockReplace = jest.fn().mockResolvedValue({ resource: expectedReplacedItem });
            store.projectsContainer.items.item = jest.fn((id, pk) => {
                if (id === projectId && pk === projectId) { // Ensure correct ID and partition key
                    return { read: mockFindRead, replace: mockReplace };
                }
                throw new Error("Unexpected item ID or partition key in mock setup for updateProjectById");
            });

            const result = await store.updateProjectById(projectId, updatePayload);

            expect(store.projectsContainer.items.item).toHaveBeenCalledWith(projectId, projectId); // For find and replace
            expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated Name', id: projectId }));
            expect(result.name).toBe('Updated Name');
            expect(result.updatedAt).toBeInstanceOf(Date);
        });

        test('deleteProjectById should remove project and its objectives', async () => {
            const projectId = 'projToDelete';
            const objectiveItem = { id: 'obj1', projectId: projectId, title: 'Obj to delete' };

            // Mock for getObjectivesByProjectId
            mockItemsInstance.query.mockReturnValue({
                fetchAll: jest.fn().mockResolvedValueOnce({ resources: [objectiveItem] })
            });

            // Mock for deleting objective
            const mockObjectiveDelete = jest.fn().mockResolvedValue({});
            store.objectivesContainer.items.item = jest.fn((id, pk) => {
                 if (id === 'obj1' && pk === projectId) return { delete: mockObjectiveDelete };
                 throw new Error("Unexpected item ID or partition key in mock setup for objective deletion");
            });

            // Mock for deleting project
            const mockProjectDelete = jest.fn().mockResolvedValue({});
            store.projectsContainer.items.item = jest.fn((id, pk) => {
                if (id === projectId && pk === projectId) return { delete: mockProjectDelete };
                throw new Error("Unexpected item ID or partition key in mock setup for project deletion");
            });

            const success = await store.deleteProjectById(projectId);

            expect(store.objectivesContainer.items.query).toHaveBeenCalledWith(
                expect.objectContaining({ query: "SELECT * FROM Objectives o WHERE o.projectId = @projectId" }),
                { partitionKey: projectId }
            );
            expect(mockObjectiveDelete).toHaveBeenCalledTimes(1);
            expect(mockProjectDelete).toHaveBeenCalledTimes(1);
            expect(success).toBe(true);
        });
    });

    describe('Objective Operations', () => {
        const projectId = 'parentProjectForObjective';
        const objectiveData = { title: 'Cosmos Objective', brief: 'Test' };

        beforeEach(async () => {
            await store._initialize();
            // Mock findProjectById for addObjective
            const parentProjectItem = { id: projectId, name: 'Parent', createdAt: new Date().toISOString() };
            const mockProjectItemRead = jest.fn().mockResolvedValue({ resource: parentProjectItem });
            store.projectsContainer.items.item = jest.fn((id, pk) => {
                if (id === projectId && pk === projectId) return { read: mockProjectItemRead };
                // Default mock for other item calls if necessary
                return { read: jest.fn().mockResolvedValue({ resource: null }) };
            });
        });

        test('addObjective should create an item in objectives container', async () => {
            const result = await store.addObjective(objectiveData, projectId);
            expect(mockItemsInstance.create).toHaveBeenCalledTimes(1); // From projectsContainer or objectivesContainer
            const callArg = store.objectivesContainer.items.create.mock.calls[0][0];
            expect(callArg.title).toBe(objectiveData.title);
            expect(callArg.projectId).toBe(projectId); // Partition key
        });

        test('getObjectivesByProjectId should query with partition key', async () => {
            const objectiveItem = { id: 'o1', projectId: projectId, title: 'O1' };
            mockItemsInstance.query.mockReturnValue({
                fetchAll: jest.fn().mockResolvedValueOnce({ resources: [objectiveItem] })
            });

            const results = await store.getObjectivesByProjectId(projectId);
            expect(store.objectivesContainer.items.query).toHaveBeenCalledWith(
                expect.objectContaining({ query: "SELECT * FROM Objectives o WHERE o.projectId = @projectId" }),
                { partitionKey: projectId }
            );
            expect(results[0].title).toBe('O1');
        });

        test('findObjectiveById should perform a cross-partition query', async () => {
            const objectiveId = 'findMeObj';
            const objectiveItem = { id: objectiveId, projectId: projectId, title: 'Found Me' };
            mockItemsInstance.query.mockReturnValue({
                fetchAll: jest.fn().mockResolvedValueOnce({ resources: [objectiveItem] })
            });

            const result = await store.findObjectiveById(objectiveId);
            expect(store.objectivesContainer.items.query).toHaveBeenCalledWith(
                expect.objectContaining({ query: "SELECT * FROM Objectives o WHERE o.id = @objectiveId" })
            );
            expect(result.title).toBe('Found Me');
        });
    });

});
