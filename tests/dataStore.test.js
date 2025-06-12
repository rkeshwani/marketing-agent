const fs = require('fs');
const path = require('path');
const Project = require('../src/models/Project');
const Objective = require('../src/models/Objective');

const DATA_FILE_PATH = path.join(__dirname, '..', 'data.json'); // Path to data.json in the project root
const BACKUP_DATA_FILE_PATH = path.join(__dirname, '..', 'data.json.backup');

// Helper functions
function backupRealData() {
    if (fs.existsSync(DATA_FILE_PATH)) {
        fs.renameSync(DATA_FILE_PATH, BACKUP_DATA_FILE_PATH);
    }
}

function restoreRealData() {
    if (fs.existsSync(BACKUP_DATA_FILE_PATH)) {
        fs.renameSync(BACKUP_DATA_FILE_PATH, DATA_FILE_PATH);
    }
}

function deleteTestDataFile() {
    if (fs.existsSync(DATA_FILE_PATH)) {
        fs.unlinkSync(DATA_FILE_PATH);
    }
}

function writeTestData(data) {
    fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function readTestData() {
    if (!fs.existsSync(DATA_FILE_PATH)) {
        return null;
    }
    const jsonData = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    return JSON.parse(jsonData);
}

function freshRequireDataStore() {
    jest.resetModules(); // Clears the cache for `require`
    return require('../src/dataStore');
}

describe('dataStore.js', () => {
    beforeAll(() => {
        backupRealData(); // Backup real data before any tests run
    });

    afterAll(() => {
        restoreRealData(); // Restore real data after all tests complete
    });

    beforeEach(() => {
        deleteTestDataFile(); // Ensure a clean slate before each test
    });

    afterEach(() => {
        deleteTestDataFile(); // Clean up after each test
        jest.resetModules(); // Reset modules to ensure dataStore is fresh if re-required w/o freshRequireDataStore
    });

    describe('Loading Data (loadDataFromFile)', () => {
        test('should load data correctly from an existing data.json', () => {
            const sampleProject = { id: 'proj_1', name: 'Test Project', description: 'A project for testing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), objectives: [] };
            const sampleObjective = { id: 'obj_1', projectId: 'proj_1', title: 'Test Objective', brief: 'An objective for testing', chatHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            writeTestData({ projects: [sampleProject], objectives: [sampleObjective] });

            const dataStore = freshRequireDataStore();
            const projects = dataStore.getAllProjects();
            const objectives = dataStore.getObjectivesByProjectId('proj_1');

            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe('Test Project');
            expect(objectives).toHaveLength(1);
            expect(objectives[0].title).toBe('Test Objective');
        });

        test('should initialize with empty data and create file if data.json does not exist', () => {
            expect(fs.existsSync(DATA_FILE_PATH)).toBe(false); // Pre-condition

            const dataStore = freshRequireDataStore(); // This will trigger loadDataFromFile

            expect(dataStore.getAllProjects()).toEqual([]);
            expect(fs.existsSync(DATA_FILE_PATH)).toBe(true);
            const fileContent = readTestData();
            expect(fileContent).toEqual({ projects: [], objectives: [] });
        });

        test('should initialize with empty data if data.json is empty JSON object {}', () => {
            writeTestData({});
            const dataStore = freshRequireDataStore();
            expect(dataStore.getAllProjects()).toEqual([]);
        });

        test('should initialize with empty data if data.json contains invalid JSON', () => {
            fs.writeFileSync(DATA_FILE_PATH, 'invalid json', 'utf8');
            // Suppress console.error for this test if possible, or expect it
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const dataStore = freshRequireDataStore();

            expect(dataStore.getAllProjects()).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalled(); // Check if error was logged
            consoleErrorSpy.mockRestore();
        });
    });

    describe('Saving Data (saveDataToFile)', () => {
        test('should save data to data.json after addProject', () => {
            const dataStore = freshRequireDataStore(); // Start with empty/non-existent data.json
            dataStore.addProject({ name: 'Save Test Project', description: 'Desc' });

            const fileContent = readTestData();
            expect(fileContent.projects).toHaveLength(1);
            expect(fileContent.projects[0].name).toBe('Save Test Project');
        });

        test('should save data after addObjective', () => {
            const dataStore = freshRequireDataStore();
            const project = dataStore.addProject({ name: 'Project For Objective', description: 'Desc' });
            dataStore.addObjective({ title: 'Save Test Objective', brief: 'Brief' }, project.id);

            const fileContent = readTestData();
            expect(fileContent.objectives).toHaveLength(1);
            expect(fileContent.objectives[0].title).toBe('Save Test Objective');
            expect(fileContent.objectives[0].projectId).toBe(project.id);
        });

        test('should save data after addMessageToObjectiveChat', () => {
            const dataStore = freshRequireDataStore();
            const project = dataStore.addProject({ name: 'Chat Project', description: 'Desc' });
            const objective = dataStore.addObjective({ title: 'Chat Objective', brief: 'Brief' }, project.id);

            dataStore.addMessageToObjectiveChat(objective.id, 'user', 'Hello from test!');

            const fileContent = readTestData();
            const loadedObjective = fileContent.objectives.find(o => o.id === objective.id);
            expect(loadedObjective.chatHistory).toHaveLength(1);
            expect(loadedObjective.chatHistory[0].speaker).toBe('user');
            expect(loadedObjective.chatHistory[0].content).toBe('Hello from test!');
            expect(loadedObjective.chatHistory[0].timestamp).toBeDefined();
        });
    });

    describe('Instance Reconstruction', () => {
        test('loaded projects should be instances of Project and have Date objects', () => {
            const projectData = {
                name: 'Instance Project',
                description: 'Check instance type',
                // dataStore.js reconstructs these from plain objects
                // Project constructor creates id, createdAt, updatedAt
            };
            // Simulate data as it would be in data.json (plain objects, ISO strings for dates)
            const plainProject = new Project(projectData.name, projectData.description); // Use constructor to get ID and dates
             // then convert dates to ISO strings for the test file
            const projectForFile = { ...plainProject, createdAt: plainProject.createdAt.toISOString(), updatedAt: plainProject.updatedAt.toISOString()};


            writeTestData({ projects: [projectForFile], objectives: [] });
            const dataStore = freshRequireDataStore();
            const projects = dataStore.getAllProjects();

            expect(projects[0].constructor.name).toBe('Project'); // Check constructor name
            expect(projects[0].createdAt).toBeInstanceOf(Date);
            expect(projects[0].updatedAt).toBeInstanceOf(Date);
            // Check if a property set by constructor exists
            expect(projects[0].id).toEqual(projectForFile.id);
        });

        test('loaded objectives should be instances of Objective and have Date objects (including chat timestamps)', () => {
            const objectiveData = {
                title: 'Instance Objective',
                brief: 'Check instance type',
                plan: { steps: [], status: 'pending_approval', questions: [], currentStepIndex: 0 },
                chatHistory: [{ speaker: 'user', content: 'Test message', timestamp: new Date().toISOString() }]
            };
            // Simulate data as it would be in data.json
            const tempProject = new Project('Temp', 'Temp'); // Objective needs a projectId
            const plainObjective = new Objective(tempProject.id, objectiveData.title, objectiveData.brief);
            // Manually set other fields as they would be if loaded from JSON
            plainObjective.plan = objectiveData.plan;
            plainObjective.chatHistory = objectiveData.chatHistory;

            const objectiveForFile = {
                 ...plainObjective,
                 createdAt: plainObjective.createdAt.toISOString(),
                 updatedAt: plainObjective.updatedAt.toISOString(),
                 chatHistory: plainObjective.chatHistory.map(m => ({...m, timestamp: new Date(m.timestamp).toISOString()})) // ensure it's ISO
            };

            writeTestData({ projects: [], objectives: [objectiveForFile] });
            const dataStore = freshRequireDataStore();
            const objectives = dataStore.getObjectivesByProjectId(tempProject.id);

            expect(objectives[0].constructor.name).toBe('Objective'); // Check constructor name
            expect(objectives[0].createdAt).toBeInstanceOf(Date);
            expect(objectives[0].updatedAt).toBeInstanceOf(Date);
            expect(objectives[0].id).toEqual(objectiveForFile.id);
            expect(objectives[0].chatHistory[0].timestamp).toBeInstanceOf(Date);
        });
    });
});
