const { Sandbox } = require('@e2b/code-interpreter');
const config = require('../config/config'); // Adjust path if config.js is elsewhere
const fs = require('fs/promises');
const fsSync = require('fs'); // For existsSync, mkdirSync
const path = require('path');
const os = require('os'); // For temporary directory

// Define a directory for temporary local asset storage and output
const TEMP_ASSET_DIR = path.join(os.tmpdir(), 'agent_e2b_assets');

// Ensure the temporary directory exists
if (!fsSync.existsSync(TEMP_ASSET_DIR)) {
    fsSync.mkdirSync(TEMP_ASSET_DIR, { recursive: true });
}

/**
 * Runs a Python script in an E2B sandbox with one input file and expects one output file.
 *
 * @param {string} pythonCode The Python code string to execute.
 * @param {string} localInputAssetPath Path to the local file that will be uploaded as input.
 * @param {string} inputAssetFilenameInSandbox Filename for the input asset inside the sandbox (e.g., 'input.png'). Script will find it in /home/user/
 * @param {string} outputAssetFilenameInSandbox Filename for the output asset inside the sandbox (e.g., 'output.png'). Script should create this in /home/user/
 * @returns {Promise<object>} An object like
 *          { success: true, outputFilePath: string, stdout: string[], stderr: string[] } or
 *          { success: false, error: string, stdout: string[], stderr: string[] }
 */
async function runPythonScriptInSandbox(
    pythonCode,
    localInputAssetPath,
    inputAssetFilenameInSandbox, // e.g., 'input.jpg'
    outputAssetFilenameInSandbox // e.g., 'output.jpg'
) {
    let sandbox = null;
    let execution;
    const sandboxInputPath = `/home/user/${inputAssetFilenameInSandbox}`;
    const sandboxOutputPath = `/home/user/${outputAssetFilenameInSandbox}`;

    console.log(`[e2bService] Preparing to run Python script. Input: ${localInputAssetPath}, Output expected as: ${outputAssetFilenameInSandbox}`);

    try {
        if (!config.E2B_API_KEY) {
            console.error("[e2bService] E2B_API_KEY is not configured.");
            return { success: false, error: "E2B service is not configured (API key missing).", stdout: [], stderr: [] };
        }

        sandbox = await Sandbox.create({
            apiKey: config.E2B_API_KEY,
            timeoutMs: 120000, // 2 minutes timeout for sandbox operations
        });
        console.log(`[e2bService] Sandbox created (ID: ${sandbox.id}). Timeout: 120s.`);

        // Upload input file
        console.log(`[e2bService] Uploading ${localInputAssetPath} to sandbox at ${sandboxInputPath}...`);
        const fileContent = await fs.readFile(localInputAssetPath);
        await sandbox.files.write(sandboxInputPath, fileContent);
        console.log("[e2bService] Input file uploaded.");

        // Execute Python code
        console.log("[e2bService] Executing Python code...");
        execution = await sandbox.runCode(pythonCode);
        console.log("[e2bService] Python code execution finished.");
        console.log("[e2bService] stdout:", execution.logs.stdout);
        console.log("[e2bService] stderr:", execution.logs.stderr);

        if (execution.error) { // Check for explicit execution error object
             console.error("[e2bService] Python script execution error object:", execution.error);
            return {
                success: false,
                error: `Python script execution failed: ${execution.error.name} - ${execution.error.message}`,
                stdout: execution.logs.stdout,
                stderr: execution.logs.stderr,
                traceback: execution.error.traceback
            };
        }

        // If stderr has content, it might indicate an error even if execution.error is not set explicitly.
        // Depending on script, stderr might be used for progress/warnings. For now, we'll return it.
        // A more robust solution would be for the Python script to use exit codes or a specific output signal for errors.

        // Download output file
        console.log(`[e2bService] Attempting to download ${sandboxOutputPath} from sandbox...`);
        const outputBuffer = await sandbox.files.read(sandboxOutputPath);
        console.log("[e2bService] Output file content read from sandbox.");

        const uniqueOutputFilename = `${Date.now()}_${outputAssetFilenameInSandbox}`;
        const localOutputFilePath = path.join(TEMP_ASSET_DIR, uniqueOutputFilename);

        await fs.writeFile(localOutputFilePath, outputBuffer);
        console.log(`[e2bService] Output file saved locally to: ${localOutputFilePath}`);

        return {
            success: true,
            outputFilePath: localOutputFilePath,
            stdout: execution.logs.stdout,
            stderr: execution.logs.stderr,
        };

    } catch (error) {
        console.error("[e2bService] Error during sandbox operation:", error);
        return {
            success: false,
            error: error.message || "An unexpected error occurred in e2bService.",
            stdout: execution ? execution.logs.stdout : [],
            stderr: execution ? (execution.error ? execution.error.traceback : execution.logs.stderr) : [error.stack],
        };
    } finally {
        if (sandbox) {
            console.log(`[e2bService] Closing sandbox (ID: ${sandbox.id})...`);
            await sandbox.kill();
            console.log("[e2bService] Sandbox closed.");
        }
    }
}

module.exports = {
    runPythonScriptInSandbox,
    TEMP_ASSET_DIR // Exporting for potential use in other services for cleanup or path construction
};
