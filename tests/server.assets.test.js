// tests/server.assets.test.js
const request = require('supertest');
const express = require('express');
const path = require('path'); // Required by server.js if it were fully loaded

// Mock dependencies
jest.mock('../src/dataStore');
jest.mock('../src/services/vectorService');
jest.mock('../src/services/geminiService'); // Though not directly used by asset routes, server.js might import it.
jest.mock('../src/agent'); // server.js imports this.

// Mock googleapis at the top level
const mockDriveFilesCreate = jest.fn();
const mockDriveFilesDelete = jest.fn();
const mockGoogleAuthOAuth2 = jest.fn().mockImplementation(() => ({
    setCredentials: jest.fn(),
    generateAuthUrl: jest.fn().mockReturnValue('mock_auth_url'),
    getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'mock_access_token', refresh_token: 'mock_refresh_token' } }),
}));
const mockGoogleDrive = jest.fn().mockImplementation(() => ({
    files: {
        create: mockDriveFilesCreate,
        delete: mockDriveFilesDelete,
        list: jest.fn().mockResolvedValue({ data: { files: [] } }) // For folder checking
    }
}));

jest.mock('googleapis', () => ({
    google: {
        auth: {
            OAuth2: mockGoogleAuthOAuth2,
        },
        drive: mockGoogleDrive,
    },
}));

const multer = require('multer'); // Required for upload route

// Import necessary modules (actual ones, not mocks, unless the module itself is mocked)
const dataStore = require('../src/dataStore');
const vectorService = require('../src/services/vectorService');
const Project = require('../src/models/Project'); // Actual model

// Setup Express app for testing
const app = express();
app.use(express.json());

// Minimal session middleware mock for Google Drive OAuth flow if those routes were included
app.use((req, res, next) => {
    req.session = req.session || {}; // Mock session
    next();
});

// Define placeholder constants that server.js would have
const GOOGLE_CLIENT_ID = 'test-google-client-id';
const GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
const GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback';


// --- Replicated Asset Route Definitions (subset from server.js) ---
// This is a common pattern for testing routes in isolation without starting the full server.
// Or, you can import your actual app router from server.js if it's structured for that.
// For this exercise, replicating the minimal route logic needed for the tests.

// GET /api/projects/:projectId/assets
app.get('/api/projects/:projectId/assets', (req, res) => {
    const { projectId } = req.params;
    try {
        const project = dataStore.findProjectById(projectId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        const assets = project.assets || [];
        res.status(200).json(assets);
    } catch (error) {
        // In a real test, you might not want console.error polluting test output
        // console.error(`Test Error - Error getting assets for project ${projectId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve assets.' });
    }
});
// --- End Replicated Asset Route Definitions ---

describe('Asset API Endpoints', () => {
    beforeEach(() => {
        // Clear mock history
        dataStore.findProjectById.mockClear();
        dataStore.updateProjectById.mockClear(); // Will be used by POST/DELETE
        vectorService.generateEmbedding.mockClear(); // Will be used by POST
        vectorService.addAssetVector.mockClear(); // Will be used by POST
        vectorService.removeAssetVector.mockClear(); // Will be used by DELETE
        mockDriveFilesCreate.mockClear(); // Will be used by POST
        mockDriveFilesDelete.mockClear(); // Will be used by DELETE
        // mockGoogleAuthOAuth2.mockClear(); // Constructor, might not need clearing or specific checks
    });

    describe('GET /api/projects/:projectId/assets', () => {
        it('should return assets for a valid project', async () => {
            const mockAssets = [{ assetId: 'asset1', name: 'Test Asset 1' }];
            dataStore.findProjectById.mockReturnValue({ id: 'proj1', name: 'Test Project', assets: mockAssets });

            const res = await request(app).get('/api/projects/proj1/assets');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual(mockAssets);
            expect(dataStore.findProjectById).toHaveBeenCalledWith('proj1');
        });

        it('should return an empty array if project has no assets', async () => {
            dataStore.findProjectById.mockReturnValue({ id: 'proj2', name: 'Project No Assets', assets: [] });
            const res = await request(app).get('/api/projects/proj2/assets');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        });

        it('should also return an empty array if project.assets is null or undefined', async () => {
            dataStore.findProjectById.mockReturnValue({ id: 'proj3', name: 'Project Null Assets' }); // assets property is undefined
            const res = await request(app).get('/api/projects/proj3/assets');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toEqual([]);
        });

        it('should return 404 if project not found', async () => {
            dataStore.findProjectById.mockReturnValue(null);
            const res = await request(app).get('/api/projects/unknownProject/assets');
            expect(res.statusCode).toEqual(404);
            expect(res.body.error).toEqual('Project not found.');
        });
    });
});
