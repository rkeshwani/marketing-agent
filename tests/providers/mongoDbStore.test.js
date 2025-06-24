// tests/providers/mongoDbStore.test.js
const MongoDbStore = require('../../src/providers/MongoDbStore');
const Project = require('../../src/models/Project');
const Objective = require('../../src/models/Objective');
const { MongoClient, ObjectId } = require('mongodb');

// Mock the MongoDB client
jest.mock('mongodb');

describe('MongoDbStore.js', () => {
    let store;
    let mockClient;
    let mockDb;
    let mockProjectsCollection;
    let mockObjectivesCollection;

    const MOCK_URI = 'mongodb://localhost:27017';
    const MOCK_DB_NAME = 'test-db';

    beforeEach(() => {
        // Reset all mocks
        mockProjectsCollection = {
            insertOne: jest.fn(),
            find: jest.fn().mockReturnThis(), // For chaining .toArray()
            toArray: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
        };
        mockObjectivesCollection = {
            insertOne: jest.fn(),
            find: jest.fn().mockReturnThis(),
            toArray: jest.fn(),
            findOne: jest.fn(),
            findOneAndUpdate: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
        };
        mockDb = {
            collection: jest.fn(name => {
                if (name === 'projects') return mockProjectsCollection;
                if (name === 'objectives') return mockObjectivesCollection;
                throw new Error(`Unexpected collection: ${name}`);
            }),
        };
        mockClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            db: jest.fn().mockReturnValue(mockDb),
            close: jest.fn().mockResolvedValue(undefined),
        };

        // Configure the MongoClient mock to return our mockClient instance
        MongoClient.mockImplementation(() => mockClient);

        store = new MongoDbStore(MOCK_URI, MOCK_DB_NAME);

        // Ensure that after store instantiation, the mock client is the one used
        // This is important because MongoDbStore creates its own client instance.
        // We are essentially asserting that our mock setup for MongoClient works.
        expect(MongoClient).toHaveBeenCalledWith(MOCK_URI);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Connection', () => {
        test('should connect to MongoDB and set up collections', async () => {
            await store.connect();
            expect(mockClient.connect).toHaveBeenCalledTimes(1);
            expect(mockClient.db).toHaveBeenCalledWith(MOCK_DB_NAME);
            expect(mockDb.collection).toHaveBeenCalledWith('projects');
            expect(mockDb.collection).toHaveBeenCalledWith('objectives');
            expect(store.db).toBe(mockDb);
            expect(store.projectsCollection).toBe(mockProjectsCollection);
            expect(store.objectivesCollection).toBe(mockObjectivesCollection);
        });

        test('should call connect if not connected when a method is called', async () => {
            mockProjectsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }); // Setup for getAllProjects
            await store.getAllProjects(); // Should trigger connect
            expect(mockClient.connect).toHaveBeenCalledTimes(1);
        });

        test('should disconnect from MongoDB', async () => {
            await store.connect(); // Ensure connected first
            await store.disconnect();
            expect(mockClient.close).toHaveBeenCalledTimes(1);
            expect(store.db).toBeNull();
        });
    });

    describe('Project Operations', () => {
        const projectData = { name: 'Test Project', description: 'A test project' };
        let newProjectInstance;

        beforeEach(()_ => {
             // Create a fresh instance for each test that might modify it
            newProjectInstance = new Project(projectData.name, projectData.description);
            // Mock the insertOne result for projects
            mockProjectsCollection.insertOne.mockResolvedValue({
                acknowledged: true,
                insertedId: new ObjectId(), // Simulate MongoDB generating an ObjectId
            });
        });

        test('addProject should insert a project and return a mapped model', async () => {
            const result = await store.addProject(projectData);

            expect(mockProjectsCollection.insertOne).toHaveBeenCalledTimes(1);
            const insertedDoc = mockProjectsCollection.insertOne.mock.calls[0][0];
            expect(insertedDoc.name).toBe(projectData.name);
            expect(insertedDoc.id).toBeDefined(); // Project model creates an id
            expect(insertedDoc.createdAt).toBeInstanceOf(Date);
            expect(insertedDoc.updatedAt).toBeInstanceOf(Date);

            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe(projectData.name);
            expect(result.id).toBeDefined(); // Should be mapped from _id or use original
        });

        test('getAllProjects should retrieve and map all projects', async () => {
            const projectDoc1 = { _id: new ObjectId(), id: 'p1', name: 'P1', description: 'D1', createdAt: new Date(), updatedAt: new Date() };
            const projectDoc2 = { _id: new ObjectId(), id: 'p2', name: 'P2', description: 'D2', createdAt: new Date(), updatedAt: new Date() };
            mockProjectsCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([projectDoc1, projectDoc2]) });

            const results = await store.getAllProjects();
            expect(mockProjectsCollection.find).toHaveBeenCalledWith({});
            expect(results).toHaveLength(2);
            expect(results[0]).toBeInstanceOf(Project);
            expect(results[0].name).toBe('P1');
            expect(results[1].name).toBe('P2');
        });

        test('findProjectById should retrieve and map a project', async () => {
            const projectId = 'uniqueProjectId';
            const projectDoc = { _id: new ObjectId(), id: projectId, name: 'Found Project', description: 'Desc', createdAt: new Date(), updatedAt: new Date() };
            mockProjectsCollection.findOne.mockResolvedValue(projectDoc);

            const result = await store.findProjectById(projectId);
            expect(mockProjectsCollection.findOne).toHaveBeenCalledWith({ id: projectId });
            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe('Found Project');
            expect(result.id).toBe(projectId);
        });

        test('updateProjectById should update and return the project', async () => {
            const projectId = 'projToUpdate';
            const originalProjectDoc = { _id: new ObjectId(), id: projectId, name: 'Original', description: 'Original Desc', createdAt: new Date(), updatedAt: new Date() };
            const updatePayload = { name: 'Updated Name' };
            // findOneAndUpdate should return the updated document
            const updatedDoc = { ...originalProjectDoc, ...updatePayload, updatedAt: new Date() };
            mockProjectsCollection.findOneAndUpdate.mockResolvedValue({ value: updatedDoc });

            const result = await store.updateProjectById(projectId, updatePayload);
            expect(mockProjectsCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { id: projectId },
                { $set: expect.objectContaining({ name: 'Updated Name', updatedAt: expect.any(Date) }) },
                { returnDocument: 'after' }
            );
            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe('Updated Name');
        });

        test('deleteProjectById should remove project and its objectives', async () => {
            const projectId = 'projToDelete';
            mockProjectsCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
            mockObjectivesCollection.deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: 2 }); // Simulate 2 objectives deleted

            const success = await store.deleteProjectById(projectId);
            expect(mockProjectsCollection.deleteOne).toHaveBeenCalledWith({ id: projectId });
            expect(mockObjectivesCollection.deleteMany).toHaveBeenCalledWith({ projectId: projectId });
            expect(success).toBe(true);
        });
    });

    describe('Objective Operations', () => {
        const projectId = 'parentProjectId';
        const objectiveData = { title: 'Test Objective', brief: 'A test objective' };
         beforeEach(async () => {
            // Mock findProjectById to simulate project existence for addObjective
            const mockProject = new Project('Parent Project', 'Description');
            mockProject.id = projectId;
             // Ensure findProjectById (which is part of the store itself) is correctly mocked IF called internally by other methods.
             // Here, we mock the collection's findOne method which findProjectById uses.
            mockProjectsCollection.findOne.mockImplementation((query) => {
                if (query.id === projectId) {
                    return Promise.resolve({ _id: new ObjectId(), ...mockProject });
                }
                return Promise.resolve(null);
            });

            mockObjectivesCollection.insertOne.mockResolvedValue({
                acknowledged: true,
                insertedId: new ObjectId(),
            });
        });

        test('addObjective should insert an objective and return mapped model', async () => {
            const result = await store.addObjective(objectiveData, projectId);

            expect(mockObjectivesCollection.insertOne).toHaveBeenCalledTimes(1);
            const insertedDoc = mockObjectivesCollection.insertOne.mock.calls[0][0];
            expect(insertedDoc.title).toBe(objectiveData.title);
            expect(insertedDoc.projectId).toBe(projectId);
            expect(insertedDoc.id).toBeDefined(); // Objective model creates an id
            expect(insertedDoc.createdAt).toBeInstanceOf(Date);

            expect(result).toBeInstanceOf(Objective);
            expect(result.title).toBe(objectiveData.title);
        });

        test('addObjective should throw error if project not found', async () => {
            mockProjectsCollection.findOne.mockResolvedValue(null); // Project not found
            await expect(store.addObjective(objectiveData, 'nonExistentProjectId'))
                .rejects
                .toThrow('Project with ID nonExistentProjectId not found. Cannot add objective.');
        });

        test('getObjectivesByProjectId should retrieve and map objectives for a project', async () => {
            const objectiveDoc1 = { _id: new ObjectId(), id: 'o1', projectId: projectId, title: 'O1', brief: 'B1', createdAt: new Date(), updatedAt: new Date() };
            const objectiveDoc2 = { _id: new ObjectId(), id: 'o2', projectId: projectId, title: 'O2', brief: 'B2', createdAt: new Date(), updatedAt: new Date() };
            mockObjectivesCollection.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([objectiveDoc1, objectiveDoc2]) });

            const results = await store.getObjectivesByProjectId(projectId);
            expect(mockObjectivesCollection.find).toHaveBeenCalledWith({ projectId: projectId });
            expect(results).toHaveLength(2);
            expect(results[0]).toBeInstanceOf(Objective);
            expect(results[0].title).toBe('O1');
        });

        test('findObjectiveById should retrieve and map an objective', async () => {
            const objectiveId = 'uniqueObjectiveId';
            const objectiveDoc = { _id: new ObjectId(), id: objectiveId, name: 'Found Objective', description: 'Desc', createdAt: new Date(), updatedAt: new Date() };
            mockObjectivesCollection.findOne.mockResolvedValue(objectiveDoc);

            const result = await store.findObjectiveById(objectiveId);
            expect(mockObjectivesCollection.findOne).toHaveBeenCalledWith({ id: objectiveId });
            expect(result).toBeInstanceOf(Objective);
        });

        test('updateObjectiveById should update and return the objective', async () => {
            const objectiveId = 'objToUpdate';
            const originalDoc = { _id: new ObjectId(), id: objectiveId, title: 'Original Title', brief: 'Brief', createdAt: new Date(), updatedAt: new Date() };
            const updatePayload = { title: 'Updated Title' };
            const updatedDoc = { ...originalDoc, ...updatePayload, updatedAt: new Date() };
            mockObjectivesCollection.findOneAndUpdate.mockResolvedValue({ value: updatedDoc });

            const result = await store.updateObjectiveById(objectiveId, updatePayload);
            expect(mockObjectivesCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { id: objectiveId },
                { $set: expect.objectContaining({ title: 'Updated Title', updatedAt: expect.any(Date) }) },
                { returnDocument: 'after' }
            );
            expect(result).toBeInstanceOf(Objective);
            expect(result.title).toBe('Updated Title');
        });

        test('deleteObjectiveById should remove an objective', async () => {
            const objectiveId = 'objToDelete';
            mockObjectivesCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const success = await store.deleteObjectiveById(objectiveId);
            expect(mockObjectivesCollection.deleteOne).toHaveBeenCalledWith({ id: objectiveId });
            expect(success).toBe(true);
        });

        test('addMessageToObjectiveChat should add a message and update timestamp', async () => {
            const objectiveId = 'objWithChat';
            const originalDoc = { _id: new ObjectId(), id: objectiveId, title: 'Chat Obj', chatHistory: [], updatedAt: new Date() };
            // Simulate findOneAndUpdate returning the updated document
            mockObjectivesCollection.findOneAndUpdate.mockImplementation((query, update) => {
                const newTimestamp = update.$set.updatedAt;
                const message = update.$push.chatHistory;
                return Promise.resolve({ value: { ...originalDoc, chatHistory: [message], updatedAt: newTimestamp } });
            });

            const message = await store.addMessageToObjectiveChat(objectiveId, 'user', 'Hello');
            expect(mockObjectivesCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { id: objectiveId },
                {
                    $push: { chatHistory: expect.objectContaining({ speaker: 'user', content: 'Hello', timestamp: expect.any(Date) }) },
                    $set: { updatedAt: expect.any(Date) }
                },
                { returnDocument: 'after' }
            );
            expect(message).toBeDefined();
            expect(message.speaker).toBe('user');
            expect(message.content).toBe('Hello');
        });
    });
});
