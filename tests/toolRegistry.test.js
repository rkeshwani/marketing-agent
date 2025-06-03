const assert = require('node:assert');
const toolRegistryService = require('../src/services/toolRegistryService');

console.log('Running tests for src/services/toolRegistryService.js...');

// Mock data or dependencies if any (none for toolRegistryService)

function setup() {
    // console.log('Test setup for toolRegistryService...');
}

function teardown() {
    // console.log('Test teardown for toolRegistryService...');
}

async function testGetAllToolSchemas() {
    console.log('Test: getAllToolSchemas should return all registered tool schemas...');
    setup();
    const schemas = toolRegistryService.getAllToolSchemas();
    assert(Array.isArray(schemas), 'Test Failed: Should return an array.');
    assert.strictEqual(schemas.length, 3, 'Test Failed: Should return 3 tool schemas initially.');

    const expectedNames = ['semantic_search_assets', 'create_image_asset', 'create_video_asset'];
    schemas.forEach(schema => {
        assert(expectedNames.includes(schema.name), `Test Failed: Schema name ${schema.name} is unexpected.`);
        assert(schema.hasOwnProperty('name'), 'Test Failed: Schema should have a name property.');
        assert(schema.hasOwnProperty('description'), 'Test Failed: Schema should have a description property.');
        assert(schema.hasOwnProperty('parameters'), 'Test Failed: Schema should have a parameters property.');
        assert.strictEqual(typeof schema.parameters, 'object', 'Test Failed: parameters should be an object.');
        assert(schema.parameters.hasOwnProperty('type'), 'Test Failed: parameters object should have a type property.');
        assert.strictEqual(schema.parameters.type, 'object', 'Test Failed: parameters.type should be "object".');
        assert(schema.parameters.hasOwnProperty('properties'), 'Test Failed: parameters object should have a properties property.');
    });
    console.log('Test Passed: getAllToolSchemas returned valid schemas.');
    teardown();
}

async function testGetToolSchema() {
    console.log('Test: getToolSchema should return a specific schema or null...');
    setup();

    const searchSchema = toolRegistryService.getToolSchema('semantic_search_assets');
    assert(searchSchema !== null, 'Test Failed: Should return schema for semantic_search_assets.');
    assert.strictEqual(searchSchema.name, 'semantic_search_assets', 'Test Failed: Incorrect schema returned.');
    assert(searchSchema.parameters.properties.hasOwnProperty('query'), 'Test Failed: semantic_search_assets schema missing query parameter.');

    const imageSchema = toolRegistryService.getToolSchema('create_image_asset');
    assert(imageSchema !== null, 'Test Failed: Should return schema for create_image_asset.');
    assert.strictEqual(imageSchema.name, 'create_image_asset', 'Test Failed: Incorrect schema returned.');
    assert(imageSchema.parameters.properties.hasOwnProperty('prompt'), 'Test Failed: create_image_asset schema missing prompt parameter.');

    const videoSchema = toolRegistryService.getToolSchema('create_video_asset');
    assert(videoSchema !== null, 'Test Failed: Should return schema for create_video_asset.');
    assert.strictEqual(videoSchema.name, 'create_video_asset', 'Test Failed: Incorrect schema returned.');
    assert(videoSchema.parameters.properties.hasOwnProperty('prompt'), 'Test Failed: create_video_asset schema missing prompt parameter.');

    const nonExistentSchema = toolRegistryService.getToolSchema('non_existent_tool');
    assert.strictEqual(nonExistentSchema, null, 'Test Failed: Should return null for non-existent tool.');

    console.log('Test Passed: getToolSchema functions correctly.');
    teardown();
}

async function runToolRegistryTests() {
    try {
        await testGetAllToolSchemas();
        await testGetToolSchema();
        console.log('All toolRegistryService tests passed!');
    } catch (error) {
        console.error('toolRegistryService Test Suite Failed:', error.message);
        console.error(error.stack); // Log stack for more details
        process.exitCode = 1; // Indicate failure
    }
}

// If this file is run directly, execute the tests
if (require.main === module) {
    runToolRegistryTests();
}

module.exports = { runToolRegistryTests };
