// tests/providers/dynamoDbStore.test.js
const DynamoDbStore = require('../../src/providers/DynamoDbStore');
const Project = require('../../src/models/Project');
const Objective = require('../../src/models/Objective');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

// Mock the AWS SDK v3 clients
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('DynamoDbStore.js', () => {
    let store;
    let mockDocClientSend;

    const MOCK_REGION = 'test-region-1';
    const MOCK_PROJECTS_TABLE = 'test-projects-table';
    const MOCK_OBJECTIVES_TABLE = 'test-objectives-table';

    beforeEach(() => {
        // Reset DynamoDBClient and DynamoDBDocumentClient mocks
        DynamoDBClient.mockClear();
        DynamoDBDocumentClient.from.mockClear();
        DynamoDBDocumentClient.prototype.send = jest.fn(); // Mock the send method
        mockDocClientSend = DynamoDBDocumentClient.prototype.send;

        // Mock the static from method to return an instance with a mocked send
        DynamoDBDocumentClient.from.mockReturnValue({ send: mockDocClientSend });

        store = new DynamoDbStore(MOCK_REGION, MOCK_PROJECTS_TABLE, MOCK_OBJECTIVES_TABLE);

        expect(DynamoDBClient).toHaveBeenCalledWith({ region: MOCK_REGION });
        expect(DynamoDBDocumentClient.from).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Project Operations', () => {
        const projectData = { name: 'Dynamo Project', description: 'A test project' };

        test('addProject should put an item into the projects table', async () => {
            mockDocClientSend.mockResolvedValue({}); // Simulate successful PutCommand

            const result = await store.addProject(projectData);

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            expect(command).toBeInstanceOf(PutCommand);
            expect(command.input.TableName).toBe(MOCK_PROJECTS_TABLE);
            expect(command.input.Item.name).toBe(projectData.name);
            expect(command.input.Item.id).toBeDefined();
            expect(typeof command.input.Item.createdAt).toBe('string'); // Stored as ISO string

            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe(projectData.name);
        });

        test('getAllProjects should scan the projects table and map items', async () => {
            const projectItem1 = { id: 'p1', name: 'P1', description: 'D1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            mockDocClientSend.mockResolvedValue({ Items: [projectItem1] });

            const results = await store.getAllProjects();

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            expect(command).toBeInstanceOf(ScanCommand);
            expect(command.input.TableName).toBe(MOCK_PROJECTS_TABLE);

            expect(results).toHaveLength(1);
            expect(results[0]).toBeInstanceOf(Project);
            expect(results[0].name).toBe('P1');
            expect(results[0].createdAt).toBeInstanceOf(Date);
        });

        test('findProjectById should get an item from the projects table', async () => {
            const projectId = 'uniqueProjectId';
            const projectItem = { id: projectId, name: 'Found Project', createdAt: new Date().toISOString() };
            mockDocClientSend.mockResolvedValue({ Item: projectItem });

            const result = await store.findProjectById(projectId);

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            expect(command).toBeInstanceOf(GetCommand);
            expect(command.input.TableName).toBe(MOCK_PROJECTS_TABLE);
            expect(command.input.Key).toEqual({ id: projectId });

            expect(result).toBeInstanceOf(Project);
            expect(result.name).toBe('Found Project');
        });

        test('findProjectById should return null if project not found', async () => {
            mockDocClientSend.mockResolvedValue({ Item: null });
            const result = await store.findProjectById('nonExistentId');
            expect(result).toBeNull();
        });

        test('updateProjectById should update an item in the projects table', async () => {
            const projectId = 'projToUpdate';
            const updatePayload = { name: 'Updated Name' };
            const updatedItem = { id: projectId, name: 'Updated Name', updatedAt: new Date().toISOString() };
            mockDocClientSend.mockResolvedValue({ Attributes: updatedItem });

            const result = await store.updateProjectById(projectId, updatePayload);

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            expect(command).toBeInstanceOf(UpdateCommand);
            expect(command.input.TableName).toBe(MOCK_PROJECTS_TABLE);
            expect(command.input.Key).toEqual({ id: projectId });
            expect(command.input.UpdateExpression).toContain('name = :name');
            expect(command.input.UpdateExpression).toContain('updatedAt = :updatedAt');
            expect(command.input.ExpressionAttributeValues[':name']).toBe('Updated Name');
            expect(typeof command.input.ExpressionAttributeValues[':updatedAt']).toBe('string');
            expect(command.input.ReturnValues).toBe('ALL_NEW');

            expect(result.name).toBe('Updated Name');
        });

        test('deleteProjectById should remove project and its objectives', async () => {
            const projectId = 'projToDelete';
            // Mock for getObjectivesByProjectId (assuming GSI query first)
            mockDocClientSend.mockResolvedValueOnce({ Items: [{ id: 'obj1', projectId: projectId }] });
            // Mock for deleteObjectiveById
            mockDocClientSend.mockResolvedValueOnce({});
            // Mock for deleteProjectById itself
            mockDocClientSend.mockResolvedValueOnce({});

            const success = await store.deleteProjectById(projectId);

            expect(mockDocClientSend).toHaveBeenCalledTimes(3); // 1 for query, 1 for delete obj, 1 for delete proj

            const queryCommand = mockDocClientSend.mock.calls[0][0];
            expect(queryCommand).toBeInstanceOf(QueryCommand); // Or ScanCommand if GSI fails/not mocked
            expect(queryCommand.input.TableName).toBe(MOCK_OBJECTIVES_TABLE);

            const deleteObjectiveCommand = mockDocClientSend.mock.calls[1][0];
            expect(deleteObjectiveCommand).toBeInstanceOf(DeleteCommand);
            expect(deleteObjectiveCommand.input.TableName).toBe(MOCK_OBJECTIVES_TABLE);
            expect(deleteObjectiveCommand.input.Key).toEqual({ id: 'obj1' });

            const deleteProjectCommand = mockDocClientSend.mock.calls[2][0];
            expect(deleteProjectCommand).toBeInstanceOf(DeleteCommand);
            expect(deleteProjectCommand.input.TableName).toBe(MOCK_PROJECTS_TABLE);
            expect(deleteProjectCommand.input.Key).toEqual({ id: projectId });

            expect(success).toBe(true);
        });
    });

    describe('Objective Operations', () => {
        const projectId = 'parentProjectId';
        const objectiveData = { title: 'Dynamo Objective', brief: 'A test objective' };

        beforeEach(() => {
            // Mock findProjectById to return a project
            const parentProjectItem = { id: projectId, name: 'Parent', createdAt: new Date().toISOString() };
            // If findProjectById is called, it will use send. The first call to send in these tests.
            mockDocClientSend.mockImplementation(command => {
                if (command instanceof GetCommand && command.input.TableName === MOCK_PROJECTS_TABLE && command.input.Key.id === projectId) {
                    return Promise.resolve({ Item: parentProjectItem });
                }
                // Default for other commands or if no specific match
                return Promise.resolve({});
            });
        });

        test('addObjective should put an item into the objectives table', async () => {
            // Reset send mock for this specific test after beforeEach's general mock
            mockDocClientSend.mockReset();
            mockDocClientSend
                .mockResolvedValueOnce({ Item: { id: projectId, name: 'Parent Project', createdAt: new Date().toISOString()} }) // For findProjectById
                .mockResolvedValueOnce({}); // For PutCommand on objectives

            const result = await store.addObjective(objectiveData, projectId);

            expect(mockDocClientSend).toHaveBeenCalledTimes(2); // findProjectById + addObjective
            const putCommand = mockDocClientSend.mock.calls[1][0];
            expect(putCommand).toBeInstanceOf(PutCommand);
            expect(putCommand.input.TableName).toBe(MOCK_OBJECTIVES_TABLE);
            expect(putCommand.input.Item.title).toBe(objectiveData.title);
            expect(putCommand.input.Item.projectId).toBe(projectId);

            expect(result).toBeInstanceOf(Objective);
        });

        test('addObjective should throw error if project not found', async () => {
            mockDocClientSend.mockResolvedValueOnce({ Item: null }); // findProjectById returns null
             await expect(store.addObjective(objectiveData, 'nonExistentProjectId'))
                .rejects
                .toThrow('Project with ID nonExistentProjectId not found. Cannot add objective.');
        });

        test('getObjectivesByProjectId should query the objectives table (GSI or Scan)', async () => {
            const objectiveItem = { id: 'o1', projectId: projectId, title: 'O1', createdAt: new Date().toISOString() };
            mockDocClientSend.mockResolvedValue({ Items: [objectiveItem] }); // For Query/Scan

            const results = await store.getObjectivesByProjectId(projectId);

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            // It will try Query first if GSI name is defined
            expect(command instanceof QueryCommand || command instanceof ScanCommand).toBe(true);
            expect(command.input.TableName).toBe(MOCK_OBJECTIVES_TABLE);
            if (command instanceof QueryCommand) {
                expect(command.input.IndexName).toBe('ObjectivesByProjectIdIndex');
                expect(command.input.KeyConditionExpression).toBe('projectId = :projectIdVal');
            } else { // Scan fallback
                expect(command.input.FilterExpression).toBe('projectId = :projectIdVal');
            }
            expect(results[0].title).toBe('O1');
        });

        test('addMessageToObjectiveChat should update chatHistory and updatedAt', async () => {
            const objectiveId = 'objChat';
            mockDocClientSend.mockResolvedValue({}); // For the UpdateCommand

            const message = await store.addMessageToObjectiveChat(objectiveId, 'user', 'Hello Dynamo');

            expect(mockDocClientSend).toHaveBeenCalledTimes(1);
            const command = mockDocClientSend.mock.calls[0][0];
            expect(command).toBeInstanceOf(UpdateCommand);
            expect(command.input.TableName).toBe(MOCK_OBJECTIVES_TABLE);
            expect(command.input.Key).toEqual({ id: objectiveId });
            expect(command.input.UpdateExpression).toBe('set chatHistory = list_append(if_not_exists(chatHistory, :empty_list), :newMessage), updatedAt = :updatedAtVal');
            expect(command.input.ExpressionAttributeValues[':newMessage']).toEqual([
                expect.objectContaining({ speaker: 'user', content: 'Hello Dynamo', timestamp: expect.any(String) })
            ]);
            expect(message.content).toBe('Hello Dynamo');
        });
    });
});
