// tests/services/microsandboxService.test.js
const { runPythonScriptInSandbox, TEMP_ASSET_DIR } = require('../../src/services/microsandboxService');
const { PythonSandbox } = require('microsandbox');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// Mock constants
const MOCK_TEMP_ASSET_DIR = path.join(os.tmpdir(), 'agent_microsandbox_assets');

// Mock fs/promises
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));

// Mock fs sync functions used for TEMP_ASSET_DIR creation
jest.mock('fs', () => {
    const originalFs = jest.requireActual('fs');
    return {
        ...originalFs, // Import and retain default behavior for other fs functions
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
    };
});

// Mock microsandbox
const mockSandboxFsWrite = jest.fn();
const mockSandboxFsRead = jest.fn();
const mockSandboxRun = jest.fn();
const mockSandboxStart = jest.fn();
const mockSandboxStop = jest.fn();

jest.mock('microsandbox', () => ({
    PythonSandbox: jest.fn().mockImplementation(() => ({
        start: mockSandboxStart,
        fs: {
            write: mockSandboxFsWrite,
            read: mockSandboxFsRead,
        },
        run: mockSandboxRun,
        stop: mockSandboxStop,
    })),
}));

describe('microsandboxService', () => {
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Mock TEMP_ASSET_DIR creation as successful
        fsSync.existsSync.mockReturnValue(false); // Simulate directory doesn't exist initially
        fsSync.mkdirSync.mockReturnValue(undefined); // Simulate successful creation

        // Re-initialize PythonSandbox mock for each test to ensure clean state
        // This is important because PythonSandbox is instantiated inside runPythonScriptInSandbox
        PythonSandbox.mockClear();
        mockSandboxStart.mockClear();
        mockSandboxFsWrite.mockClear();
        mockSandboxRun.mockClear();
        mockSandboxFsRead.mockClear();
        mockSandboxStop.mockClear();
    });

    describe('runPythonScriptInSandbox', () => {
        const pythonCode = 'print("hello")';
        const localInputAssetPath = '/fake/input.txt';
        const inputAssetFilenameInSandbox = 'input.txt';
        const outputAssetFilenameInSandbox = 'output.txt';
        const sandboxInputPath = `/home/user/${inputAssetFilenameInSandbox}`;
        const sandboxOutputPath = `/home/user/${outputAssetFilenameInSandbox}`;

        it('should execute a Python script successfully', async () => {
            const inputContent = Buffer.from('input data');
            const outputContent = Buffer.from('output data');
            const expectedStdout = ['hello world'];
            const expectedStderr = [];

            fs.readFile.mockResolvedValue(inputContent);
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockResolvedValue(undefined);
            mockSandboxRun.mockResolvedValue({ stdout: 'hello world', stderr: '' });
            mockSandboxFsRead.mockResolvedValue(outputContent);
            fs.writeFile.mockResolvedValue(undefined);
            mockSandboxStop.mockResolvedValue(undefined);

            // Ensure the service itself can create TEMP_ASSET_DIR if it needs to
            // For the test, we assume it's called if existsSync is false
            // The actual call to the service will trigger its internal check.
            fsSync.existsSync.mockReturnValueOnce(false);


            const result = await runPythonScriptInSandbox(
                pythonCode,
                localInputAssetPath,
                inputAssetFilenameInSandbox,
                outputAssetFilenameInSandbox
            );

            expect(fsSync.existsSync).toHaveBeenCalledWith(MOCK_TEMP_ASSET_DIR);
            expect(fsSync.mkdirSync).toHaveBeenCalledWith(MOCK_TEMP_ASSET_DIR, { recursive: true });

            expect(PythonSandbox).toHaveBeenCalledTimes(1);
            expect(mockSandboxStart).toHaveBeenCalledTimes(1);
            expect(fs.readFile).toHaveBeenCalledWith(localInputAssetPath);
            expect(mockSandboxFsWrite).toHaveBeenCalledWith(sandboxInputPath, inputContent);
            expect(mockSandboxRun).toHaveBeenCalledWith(pythonCode);
            expect(mockSandboxFsRead).toHaveBeenCalledWith(sandboxOutputPath);
            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining(MOCK_TEMP_ASSET_DIR), //path.join(TEMP_ASSET_DIR, uniqueOutputFilename)
                outputContent
            );
            expect(mockSandboxStop).toHaveBeenCalledTimes(1);

            expect(result.success).toBe(true);
            expect(result.outputFilePath).toEqual(expect.stringContaining(outputAssetFilenameInSandbox));
            expect(result.stdout).toEqual(expectedStdout);
            expect(result.stderr).toEqual(expectedStderr);
        });

        it('should capture stderr output correctly', async () => {
            fs.readFile.mockResolvedValue(Buffer.from('input'));
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockResolvedValue(undefined);
            mockSandboxRun.mockResolvedValue({ stdout: 'normal output', stderr: 'warning: something happened\nanother warning' });
            mockSandboxFsRead.mockResolvedValue(Buffer.from('output data'));
            fs.writeFile.mockResolvedValue(undefined);
            mockSandboxStop.mockResolvedValue(undefined);

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(result.success).toBe(true);
            expect(result.stdout).toEqual(['normal output']);
            expect(result.stderr).toEqual(['warning: something happened', 'another warning']);
            expect(mockSandboxStop).toHaveBeenCalledTimes(1);
        });

        it('should handle Python script execution error', async () => {
            const error = {
                name: 'SyntaxError',
                message: 'invalid syntax',
                stack: 'Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nSyntaxError: invalid syntax'
            };
            fs.readFile.mockResolvedValue(Buffer.from('input'));
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockResolvedValue(undefined);
            mockSandboxRun.mockResolvedValue({ error: error, stdout: '', stderr: '' });
            // No fs.read or fs.writeFile should be called if script errors
            mockSandboxStop.mockResolvedValue(undefined);

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe(`Python script execution failed: ${error.message}`);
            expect(result.stdout).toEqual(['']);
            expect(result.stderr).toEqual(['']); // Assuming error implies empty stderr from logs
            expect(result.traceback).toEqual(error.stack.split('\n'));
            expect(mockSandboxFsRead).not.toHaveBeenCalled();
            expect(fs.writeFile).not.toHaveBeenCalled();
            expect(mockSandboxStop).toHaveBeenCalledTimes(1);
        });

        it('should handle error during sandbox.fs.write', async () => {
            const sdkError = new Error('SDK write error');
            fs.readFile.mockResolvedValue(Buffer.from('input'));
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockRejectedValue(sdkError);
            mockSandboxStop.mockResolvedValue(undefined);

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe(sdkError.message);
            expect(mockSandboxRun).not.toHaveBeenCalled();
            expect(mockSandboxStop).toHaveBeenCalledTimes(1);
        });

        it('should handle error during local input fs.readFile', async () => {
            const readError = new Error('Local file read error');
            fs.readFile.mockRejectedValue(readError);
            // PythonSandbox constructor should not be called if fs.readFile fails before it
            mockSandboxStop.mockResolvedValue(undefined); // Though sandbox might not even be created

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(PythonSandbox).not.toHaveBeenCalled(); // Since it fails before sandbox creation
            expect(result.success).toBe(false);
            expect(result.error).toBe(readError.message);
            expect(mockSandboxStart).not.toHaveBeenCalled();
            expect(mockSandboxFsWrite).not.toHaveBeenCalled();
            expect(mockSandboxRun).not.toHaveBeenCalled();
            expect(mockSandboxStop).not.toHaveBeenCalled(); // Sandbox object is null
        });

        it('should handle error during sandbox.fs.read (output file)', async () => {
            const sdkReadError = new Error('SDK read error for output');
            fs.readFile.mockResolvedValue(Buffer.from('input'));
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockResolvedValue(undefined);
            mockSandboxRun.mockResolvedValue({ stdout: 'some output', stderr: '' });
            mockSandboxFsRead.mockRejectedValue(sdkReadError); // This one fails
            mockSandboxStop.mockResolvedValue(undefined);

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe(sdkReadError.message);
            expect(fs.writeFile).not.toHaveBeenCalled();
            expect(mockSandboxStop).toHaveBeenCalledTimes(1);
        });

        it('should call sandbox.stop() even if sandbox.run throws an unhandled error', async () => {
            const runError = new Error('Unexpected sandbox.run error');
            fs.readFile.mockResolvedValue(Buffer.from('input'));
            mockSandboxStart.mockResolvedValue(undefined);
            mockSandboxFsWrite.mockResolvedValue(undefined);
            mockSandboxRun.mockRejectedValue(runError); // Simulating an unhandled promise rejection from sandbox.run
            mockSandboxStop.mockResolvedValue(undefined);

            const result = await runPythonScriptInSandbox(
                pythonCode, localInputAssetPath, inputAssetFilenameInSandbox, outputAssetFilenameInSandbox
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe(runError.message);
            expect(mockSandboxFsRead).not.toHaveBeenCalled();
            expect(fs.writeFile).not.toHaveBeenCalled();
            expect(mockSandboxStop).toHaveBeenCalledTimes(1); // Crucial check
        });
    });
});
