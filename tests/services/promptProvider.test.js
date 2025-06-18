// tests/services/promptProvider.test.js
const { getPrompt } = require('../../src/services/promptProvider');
const fs = require('fs/promises');
const path = require('path');

// Mock fs.readFile
jest.mock('fs/promises');

// Define PROMPT_BASE_PATH as it is in the actual module
const PROMPT_BASE_PATH = path.join(__dirname, '..', '..', 'prompts');

describe('PromptProvider Service', () => {
    beforeEach(() => {
        // Clear all instances and calls to constructor and all methods:
        fs.readFile.mockClear();
        // Clear the cache in promptProvider if it's accessible, or re-initialize module if needed.
        // For this example, we assume the cache is not directly accessible for clearing in tests,
        // so we rely on mocking readFile to control behavior per test.
        // If promptCache was exported, we could clear it here.
    });

    it('should load a prompt and replace placeholders', async () => {
        const mockPromptTemplate = "Hello {{name}}! Welcome to {{place}}.";
        const promptKey = 'test/hello_world';
        const contextData = { name: 'User', place: 'Earth' };
        const expectedPrompt = "Hello User! Welcome to Earth.";

        fs.readFile.mockResolvedValue(mockPromptTemplate);

        const result = await getPrompt(promptKey, contextData);

        expect(fs.readFile).toHaveBeenCalledWith(path.join(PROMPT_BASE_PATH, `${promptKey}.txt`), 'utf-8');
        expect(result).toBe(expectedPrompt);
    });

    it('should load a prompt without placeholders if no context is given', async () => {
        const mockPromptTemplate = "This is a static prompt.";
        const promptKey = 'test/static_prompt';
        const expectedPrompt = "This is a static prompt.";

        fs.readFile.mockResolvedValue(mockPromptTemplate);

        const result = await getPrompt(promptKey);
        expect(fs.readFile).toHaveBeenCalledWith(path.join(PROMPT_BASE_PATH, `${promptKey}.txt`), 'utf-8');
        expect(result).toBe(expectedPrompt);
    });

    it('should handle multiple occurrences of the same placeholder', async () => {
        const mockPromptTemplate = "Repeat: {{word}}, {{word}} and {{word}}.";
        const promptKey = 'test/repeat_word';
        const contextData = { word: 'echo' };
        const expectedPrompt = "Repeat: echo, echo and echo.";

        fs.readFile.mockResolvedValue(mockPromptTemplate);

        const result = await getPrompt(promptKey, contextData);
        expect(result).toBe(expectedPrompt);
    });

    it('should throw an error if prompt file is not found', async () => {
        const promptKey = 'test/non_existent_prompt';
        const enoentError = new Error("File not found");
        enoentError.code = 'ENOENT';
        fs.readFile.mockRejectedValue(enoentError);

        await expect(getPrompt(promptKey, {}))
            .rejects
            .toThrow(`Prompt file not found for key: ${promptKey}`);
    });

    it('should throw a generic error for other file read issues', async () => {
        const promptKey = 'test/read_error_prompt';
        fs.readFile.mockRejectedValue(new Error('Some other read error'));

        await expect(getPrompt(promptKey, {}))
            .rejects
            .toThrow(`Failed to process prompt for key ${promptKey}: Some other read error`);
    });

    it('should correctly escape regex special characters in placeholders', async () => {
        // This test ensures that if a placeholder key contains regex special characters,
        // it is still replaced correctly. The implementation of getPrompt uses a regex
        // replacement, so the key needs to be escaped.
        const mockPromptTemplate = "Value for {{key.with.dots}} is {{value}}";
        const promptKey = 'test/special_char_key';
        const contextData = { 'key.with.dots': 'found.it', value: 'some value' };
        const expectedPrompt = "Value for found.it is some value";

        fs.readFile.mockResolvedValue(mockPromptTemplate);

        const result = await getPrompt(promptKey, contextData);
        expect(result).toBe(expectedPrompt);
    });

    // Basic caching test (requires NODE_ENV='production')
    describe('Caching in Production', () => {
        const originalNodeEnv = process.env.NODE_ENV;

        beforeAll(() => {
            process.env.NODE_ENV = 'production';
        });

        afterAll(() => {
            process.env.NODE_ENV = originalNodeEnv; // Reset NODE_ENV
        });

        beforeEach(() => {
            // Clear fs.readFile mocks and any cache before each test in this block
            fs.readFile.mockClear();
            // To properly test caching, we'd need to reset the internal cache of promptProvider.
            // One way is to re-require the module, invalidating Jest's cache for it.
            jest.resetModules(); // This will clear Jest's cache for all modules
            // Re-require and re-mock. This is a bit heavy-handed.
            const { getPrompt: getPromptFresh } = require('../../src/services/promptProvider');
            const fsFresh = require('fs/promises');
            jest.mock('fs/promises'); // Re-mock fs for the fresh module

            // Setup a default mock for fs.readFile for these tests
            fsFresh.readFile.mockImplementation(async (filePath) => {
                if (filePath.includes('cache_test_prompt.txt')) {
                    return "Cached: {{data}}";
                }
                throw new Error('File not found in mock for caching test');
            });
        });


        it('should read from file system once and use cache for subsequent calls in production', async () => {
            // Need to use the fresh getPrompt obtained after jest.resetModules()
            const { getPrompt: getPromptCached } = require('../../src/services/promptProvider');
            const fsPromisesCached = require('fs/promises'); // Get the mocked version tied to the reset module

            const promptKey = 'cache/cache_test_prompt';
            const context = { data: 'test1' };

            // Call 1
            await getPromptCached(promptKey, context);
            expect(fsPromisesCached.readFile).toHaveBeenCalledTimes(1);
            expect(fsPromisesCached.readFile).toHaveBeenCalledWith(path.join(PROMPT_BASE_PATH, `${promptKey}.txt`), 'utf-8');

            // Call 2 with different context, should still use cached template
            const context2 = { data: 'test2' };
            const result2 = await getPromptCached(promptKey, context2);
            expect(fsPromisesCached.readFile).toHaveBeenCalledTimes(1); // Should not be called again
            expect(result2).toBe("Cached: test2");

            // Call 3 with same context
            const context3 = { data: 'test3' };
            const result3 = await getPromptCached(promptKey, context3);
            expect(fsPromisesCached.readFile).toHaveBeenCalledTimes(1);
            expect(result3).toBe("Cached: test3");
        });
    });

});
