const { PythonSandbox } = require('microsandbox'); // Changed import
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');

// Define a directory for temporary local asset storage and output
const TEMP_ASSET_DIR = path.join(os.tmpdir(), 'agent_microsandbox_assets'); // Changed dir name slightly

// Ensure the temporary directory exists
if (!fsSync.existsSync(TEMP_ASSET_DIR)) {
    fsSync.mkdirSync(TEMP_ASSET_DIR, { recursive: true });
}

/**
 * Runs a Python script in a Microsandbox with one input file and expects one output file.
 *
 * @param {string} pythonCode The Python code string to execute.
 * @param {string} localInputAssetPath Path to the local file that will be uploaded as input.
 * @param {string} inputAssetFilenameInSandbox Filename for the input asset inside the sandbox (e.g., 'input.png'). Script will find it in /home/user/ or specified sandbox path.
 * @param {string} outputAssetFilenameInSandbox Filename for the output asset inside the sandbox (e.g., 'output.png'). Script should create this in its working directory.
 * @returns {Promise<object>} An object like
 *          { success: true, outputFilePath: string_or_null, stdout: string[], stderr: string[], error?: string, traceback?: string[] }
 */
async function runPythonScriptInSandbox(
    pythonCode,
    localInputAssetPath,
    inputAssetFilenameInSandbox, // e.g., 'input.jpg'
    outputAssetFilenameInSandbox // e.g., 'output.jpg'
) {
    let sandbox = null;
    // Assuming default working directory in microsandbox is /home/user or /
    // For now, let's try to write to the root, or a dedicated input dir if necessary.
    // The task states to try and make /home/user work. Microsandbox might use /home/user by default.
    const sandboxInputPath = `/home/user/${inputAssetFilenameInSandbox}`; // Kept as per subtask instruction
    const sandboxOutputPath = `/home/user/${outputAssetFilenameInSandbox}`; // Kept as per subtask instruction

    console.log(`[microsandboxService] Preparing to run Python script. Input: ${localInputAssetPath}, Output expected as: ${outputAssetFilenameInSandbox}`);

    try {
        // Initialize Microsandbox PythonSandbox
        // No API key mentioned for local dev server, assuming it's picked from env or not needed for dev.
        sandbox = new PythonSandbox(); // Using 'new' assuming it's a class
        await sandbox.start(); // Microsandbox might need an explicit start
        console.log(`[microsandboxService] PythonSandbox started.`);

        // Upload input file
        console.log(`[microsandboxService] Uploading ${localInputAssetPath} to sandbox at ${sandboxInputPath}...`);
        const fileContent = await fs.readFile(localInputAssetPath);
        await sandbox.fs.write(sandboxInputPath, fileContent); // Using sandbox.fs.write as suggested
        console.log("[microsandboxService] Input file uploaded.");

        // Execute Python code
        console.log("[microsandboxService] Executing Python code...");
        const result = await sandbox.run(pythonCode); // Using sandbox.run as suggested
        console.log("[microsandboxService] Python code execution finished.");
        // Assuming result structure: { stdout: string, stderr: string, error?: Error, data?: any }
        // And logs might be arrays or strings. Let's assume they are strings and split by newline.
        const stdout = result.stdout ? result.stdout.split('\n') : [];
        const stderr = result.stderr ? result.stderr.split('\n') : [];
        console.log("[microsandboxService] stdout:", stdout);
        console.log("[microsandboxService] stderr:", stderr);

        if (result.error) {
            console.error("[microsandboxService] Python script execution error:", result.error);
            // Adapt error object if microsandbox provides name, message, traceback differently
            const errorDetails = result.error instanceof Error ? result.error.message : String(result.error);
            const traceback = result.error.stack ? result.error.stack.split('\n') : (result.traceback || []);
            return {
                success: false,
                error: `Python script execution failed: ${errorDetails}`,
                stdout: stdout,
                stderr: stderr,
                traceback: traceback
            };
        }

        // Check for output file
        console.log(`[microsandboxService] Attempting to download ${sandboxOutputPath} from sandbox...`);
        const outputBuffer = await sandbox.fs.read(sandboxOutputPath); // Using sandbox.fs.read as suggested
        console.log("[microsandboxService] Output file content read from sandbox.");

        const uniqueOutputFilename = `${Date.now()}_${outputAssetFilenameInSandbox}`;
        const localOutputFilePath = path.join(TEMP_ASSET_DIR, uniqueOutputFilename);

        await fs.writeFile(localOutputFilePath, outputBuffer);
        console.log(`[microsandboxService] Output file saved locally to: ${localOutputFilePath}`);

        return {
            success: true,
            outputFilePath: localOutputFilePath,
            stdout: stdout,
            stderr: stderr,
        };

    } catch (error) {
        console.error("[microsandboxService] Error during sandbox operation:", error);
        const stdout = error.stdout ? String(error.stdout).split('\n') : [];
        const stderr = error.stderr ? String(error.stderr).split('\n') : (error.stack ? [error.stack] : []);
        const traceback = error.traceback ? error.traceback : (error.stack ? error.stack.split('\n') : []);

        return {
            success: false,
            error: error.message || "An unexpected error occurred in microsandboxService.",
            stdout: stdout,
            stderr: stderr,
            traceback: traceback,
        };
    } finally {
        if (sandbox) {
            console.log(`[microsandboxService] Stopping sandbox...`);
            await sandbox.stop(); // Using sandbox.stop as suggested
            console.log("[microsandboxService] Sandbox stopped.");
        }
    }
}

module.exports = {
    runPythonScriptInSandbox,
    TEMP_ASSET_DIR
};
