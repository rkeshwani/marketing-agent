// src/services/promptProvider.js
const fs = require('fs/promises');
const path = require('path');

// Cache to store loaded prompts to avoid repeated file reads in production
const promptCache = new Map();
const PROMPT_BASE_PATH = path.join(__dirname, '..', '..', 'prompts'); // Resolves to project_root/prompts

/**
 * Retrieves a prompt by its key, loads it from the corresponding .txt file,
 * and injects context data into placeholders.
 *
 * Placeholders in the prompt file should be in the format {{variableName}}.
 *
 * @param {string} promptKey - A key identifying the prompt, corresponding to its file path
 *                             relative to the `prompts` directory, without the .txt extension.
 *                             Example: 'agent/google_ads_campaign_config' for 'prompts/agent/google_ads_campaign_config.txt'.
 * @param {Object} [contextData={}] - An object containing key-value pairs for placeholder replacement.
 *                                    Example: { projectContext: "Project A", campaign_name_suggestion: "New Campaign" }.
 * @returns {Promise<string>} A promise that resolves to the processed prompt string.
 * @throws {Error} If the prompt file is not found or if there's an error during processing.
 */
async function getPrompt(promptKey, contextData = {}) {
    const promptFilePath = path.join(PROMPT_BASE_PATH, `${promptKey}.txt`);

    try {
        let promptTemplate;
        if (process.env.NODE_ENV === 'production' && promptCache.has(promptKey)) {
            promptTemplate = promptCache.get(promptKey);
        } else {
            promptTemplate = await fs.readFile(promptFilePath, 'utf-8');
            if (process.env.NODE_ENV === 'production') {
                promptCache.set(promptKey, promptTemplate);
            }
        }

        // Replace placeholders
        let processedPrompt = promptTemplate;
        for (const key in contextData) {
            if (Object.hasOwnProperty.call(contextData, key)) {
                const placeholder = `{{${key}}}`;
                // Using a global regex to replace all occurrences of the placeholder
                processedPrompt = processedPrompt.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\]/g, '\\$&'), 'g'), contextData[key]);
            }
        }

        // Optional: Check for unreplaced placeholders (can be noisy if some are intentionally left)
        // const unreplacedPlaceholders = processedPrompt.match(/{{(.*?)}}/g);
        // if (unreplacedPlaceholders && unreplacedPlaceholders.length > 0) {
        //     console.warn(`Prompt key '${promptKey}': Unreplaced placeholders found: ${unreplacedPlaceholders.join(', ')}`);
        // }

        return processedPrompt;

    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Prompt file not found for key: ${promptKey} at path: ${promptFilePath}`);
            throw new Error(`Prompt file not found for key: ${promptKey}`);
        }
        console.error(`Error processing prompt for key ${promptKey}:`, error);
        throw new Error(`Failed to process prompt for key ${promptKey}: ${error.message}`);
    }
}

module.exports = {
    getPrompt,
};
