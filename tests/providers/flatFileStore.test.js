// tests/providers/flatFileStore.test.js
const fs = require('fs').promises; // Use promises version for async operations
const path = require('path');
const Project = require('../../src/models/Project'); // Adjusted path
const Objective = require('../../src/models/Objective'); // Adjusted path
const FlatFileStore = require('../../src/providers/FlatFileStore'); // Adjusted path

const TEST_DATA_FILE_PATH = path.join(__dirname, '..', '..', 'test-data.json'); // Use a dedicated test data file
const BACKUP_DATA_FILE_PATH = path.join(__dirname, '..', '..', 'data.json.backup'); // Real data backup
const ACTUAL_DATA_FILE_PATH = path.join(__dirname, '..', '..', 'data.json'); // Path to actual data.json

// Helper functions
async function backupRealData() {
    try {
        await fs.access(ACTUAL_DATA_FILE_PATH);
        await fs.rename(ACTUAL_DATA_FILE_PATH, BACKUP_DATA_FILE_PATH);
        console.log('Real data backed up.');
    } catch (error) {
        // If actual data file doesn't exist, no need to back up
        if (error.code === 'ENOENT') {
            console.log('No real data file to back up.');
            return;
        }
        console.error('Error backing up real data:', error);
    }
}

async function restoreRealData() {
    try {
        await fs.access(BACKUP_DATA_FILE_PATH);
        await fs.rename(BACKUP_DATA_FILE_PATH, ACTUAL_DATA_FILE_PATH);
        console.log('Real data restored.');
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If backup doesn't exist, nothing to restore
            console.log('No backup data file to restore.');
            return;
        }
        console.error('Error restoring real data:', error);
    }
}

async function deleteTestDataFile() {
    try {
        await fs.unlink(TEST_DATA_FILE_PATH);
    } catch (error) {
        if (error.code !== 'ENOENT') { // Ignore if file doesn't exist
            console.error('Error deleting test data file:', error);
        }
    }
}

async function writeTestData(data) {
    await fs.writeFile(TEST_DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function readTestData() {
    try {
        const jsonData = await fs.readFile(TEST_DATA_FILE_PATH, 'utf8');
        return JSON.parse(jsonData);
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

describe('FlatFileStore.js', () => {
    beforeAll(async () => {
        await backupRealData(); // Backup real data before any tests run
    });

    afterAll(async () => {
        await restoreRealData(); // Restore real data after all tests complete
        await deleteTestDataFile(); // Clean up test data file after all tests
    });

    beforeEach(async () => {
        await deleteTestDataFile(); // Ensure a clean slate before each test
    });

    afterEach(async () => {
        await deleteTestDataFile(); // Clean up after each test
        jest.resetModules();
    });

    describe('Loading Data (loadData)', () => {
        test('should load data correctly from an existing test-data.json', async () => {
            const sampleProject = { id: 'proj_1', name: 'Test Project', description: 'A project for testing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            const sampleObjective = { id: 'obj_1', projectId: 'proj_1', title: 'Test Objective', brief: 'An objective for testing', chatHistory: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), plan: {steps: [], status: 'pending', questions: [], currentStepIndex: 0} };
            await writeTestData({ projects: [sampleProject], objectives: [sampleObjective] });

            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            const projects = await store.getAllProjects();
            const objectives = await store.getObjectivesByProjectId('proj_1');

            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe('Test Project');
            expect(objectives).toHaveLength(1);
            expect(objectives[0].title).toBe('Test Objective');
        });

        test('should initialize with empty data and create file if test-data.json does not exist', async () => {
            // Pre-condition: file should not exist (handled by beforeEach)
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData(); // This will trigger loadData

            expect(await store.getAllProjects()).toEqual([]);

            const fileExists = await fs.access(TEST_DATA_FILE_PATH).then(() => true).catch(() => false);
            expect(fileExists).toBe(true);

            const fileContent = await readTestData();
            expect(fileContent).toEqual({ projects: [], objectives: [] });
        });

        test('should initialize with empty data if test-data.json is empty JSON object {}', async () => {
            await writeTestData({});
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            expect(await store.getAllProjects()).toEqual([]);
        });

        test('should initialize with empty data if test-data.json contains invalid JSON', async () => {
            await fs.writeFile(TEST_DATA_FILE_PATH, 'invalid json', 'utf8');
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();

            expect(await store.getAllProjects()).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe('Saving Data (saveData)', () => {
        test('should save data to test-data.json after addProject', async () => {
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData(); // Initialize empty store and potentially create file
            await store.addProject({ name: 'Save Test Project', description: 'Desc' });

            const fileContent = await readTestData();
            expect(fileContent.projects).toHaveLength(1);
            expect(fileContent.projects[0].name).toBe('Save Test Project');
        });

        test('should save data after addObjective', async () => {
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            const project = await store.addProject({ name: 'Project For Objective', description: 'Desc' });
            await store.addObjective({ title: 'Save Test Objective', brief: 'Brief' }, project.id);

            const fileContent = await readTestData();
            expect(fileContent.objectives).toHaveLength(1);
            expect(fileContent.objectives[0].title).toBe('Save Test Objective');
            expect(fileContent.objectives[0].projectId).toBe(project.id);
        });

        test('should save data after addMessageToObjectiveChat', async () => {
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            const project = await store.addProject({ name: 'Chat Project', description: 'Desc' });
            const objective = await store.addObjective({ title: 'Chat Objective', brief: 'Brief' }, project.id);

            await store.addMessageToObjectiveChat(objective.id, 'user', 'Hello from test!');

            const fileContent = await readTestData();
            const loadedObjective = fileContent.objectives.find(o => o.id === objective.id);
            expect(loadedObjective.chatHistory).toHaveLength(1);
            expect(loadedObjective.chatHistory[0].speaker).toBe('user');
            expect(loadedObjective.chatHistory[0].content).toBe('Hello from test!');
            expect(loadedObjective.chatHistory[0].timestamp).toBeDefined();
        });
    });

    describe('Instance Reconstruction', () => {
        test('loaded projects should be instances of Project and have Date objects', async () => {
            const plainProject = new Project('Instance Project', 'Check instance type');
            const projectForFile = {
                ...JSON.parse(JSON.stringify(plainProject)), // to plain object
                createdAt: plainProject.createdAt.toISOString(),
                updatedAt: plainProject.updatedAt.toISOString()
            };

            await writeTestData({ projects: [projectForFile], objectives: [] });
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            const projects = await store.getAllProjects();

            expect(projects[0]).toBeInstanceOf(Project);
            expect(projects[0].createdAt).toBeInstanceOf(Date);
            expect(projects[0].updatedAt).toBeInstanceOf(Date);
            expect(projects[0].id).toEqual(projectForFile.id);
        });

        test('loaded objectives should be instances of Objective and have Date objects (including chat timestamps)', async () => {
            const tempProject = new Project('Temp', 'Temp');
            const plainObjective = new Objective(tempProject.id, 'Instance Objective', 'Check instance type');
            plainObjective.plan = { steps: [], status: 'pending_approval', questions: [], currentStepIndex: 0 };
            plainObjective.chatHistory = [{ speaker: 'user', content: 'Test message', timestamp: new Date() }];

            const objectiveForFile = {
                 ...JSON.parse(JSON.stringify(plainObjective)),
                 createdAt: plainObjective.createdAt.toISOString(),
                 updatedAt: plainObjective.updatedAt.toISOString(),
                 chatHistory: plainObjective.chatHistory.map(m => ({...m, timestamp: new Date(m.timestamp).toISOString()}))
            };

            await writeTestData({ projects: [], objectives: [objectiveForFile] });
            const store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData();
            // Need to add tempProject to store so getObjectivesByProjectId can find its objectives
            // or just use getAllObjectives and filter manually for this test.
            const objectives = (await store.getAllObjectives()).filter(o => o.projectId === tempProject.id);


            expect(objectives[0]).toBeInstanceOf(Objective);
            expect(objectives[0].createdAt).toBeInstanceOf(Date);
            expect(objectives[0].updatedAt).toBeInstanceOf(Date);
            expect(objectives[0].id).toEqual(objectiveForFile.id);
            expect(objectives[0].chatHistory[0].timestamp).toBeInstanceOf(Date);
        });
    });

    describe('CRUD Operations', () => {
        let store;
        beforeEach(async () => {
            store = new FlatFileStore(TEST_DATA_FILE_PATH);
            await store.loadData(); // Start with a clean, loaded store
        });

        test('addProject should add a project and return it', async () => {
            const projectData = { name: 'CRUD Project', description: 'Testing add' };
            const addedProject = await store.addProject(projectData);
            expect(addedProject.name).toBe(projectData.name);
            expect(addedProject.id).toBeDefined();

            const projects = await store.getAllProjects();
            expect(projects).toHaveLength(1);
            expect(projects[0].id).toBe(addedProject.id);
        });

        test('findProjectById should return the correct project or null', async () => {
            const projectData = { name: 'Find Me', description: 'Test find' };
            const addedProject = await store.addProject(projectData);

            const foundProject = await store.findProjectById(addedProject.id);
            expect(foundProject).toBeDefined();
            expect(foundProject.id).toBe(addedProject.id);

            const notFoundProject = await store.findProjectById('nonexistent-id');
            expect(notFoundProject).toBeUndefined(); // find returns undefined for not found
        });

        test('updateProjectById should update and return the project', async () => {
            const projectData = { name: 'Update Original', description: 'Original desc' };
            const addedProject = await store.addProject(projectData);

            const updatePayload = { name: 'Updated Name', description: 'Updated desc' };
            const updatedProject = await store.updateProjectById(addedProject.id, updatePayload);

            expect(updatedProject.name).toBe(updatePayload.name);
            expect(updatedProject.description).toBe(updatePayload.description);
            expect(updatedProject.updatedAt.getTime()).toBeGreaterThan(addedProject.updatedAt.getTime());

            const refetchedProject = await store.findProjectById(addedProject.id);
            expect(refetchedProject.name).toBe(updatePayload.name);
        });

        test('deleteProjectById should remove the project and associated objectives', async () => {
            const project = await store.addProject({ name: 'To Delete', description: 'Project for deletion test' });
            await store.addObjective({ title: 'Objective 1 of To Delete', brief: 'Brief' }, project.id);
            await store.addObjective({ title: 'Objective 2 of To Delete', brief: 'Brief' }, project.id);

            const deleteSuccess = await store.deleteProjectById(project.id);
            expect(deleteSuccess).toBe(true);

            const foundProject = await store.findProjectById(project.id);
            expect(foundProject).toBeUndefined();

            const objectives = await store.getAllObjectives();
            expect(objectives.filter(o => o.projectId === project.id)).toHaveLength(0);
        });

        // Similar tests for objectives
        test('addObjective should add an objective to a project', async () => {
            const project = await store.addProject({ name: 'Objective Test Project', description: 'Desc' });
            const objectiveData = { title: 'My Objective', brief: 'Test objective add' };
            const addedObjective = await store.addObjective(objectiveData, project.id);

            expect(addedObjective.title).toBe(objectiveData.title);
            expect(addedObjective.projectId).toBe(project.id);

            const objectives = await store.getObjectivesByProjectId(project.id);
            expect(objectives).toHaveLength(1);
            expect(objectives[0].id).toBe(addedObjective.id);
        });
    });
});
