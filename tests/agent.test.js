const assert = require('node:assert');
const agent = require('../src/agent');
const geminiService = require('../src/services/geminiService');

// --- Test Suite for Agent ---

console.log('Running tests for src/agent.js...');

// Mock the geminiService for testing purposes
let originalFetchGeminiResponse;

function setup() {
  // Store the original function
  originalFetchGeminiResponse = geminiService.fetchGeminiResponse;

  // Override with a mock function
  geminiService.fetchGeminiResponse = async (userInput, chatHistory) => {
    console.log(`Mocked geminiService.fetchGeminiResponse called with: "${userInput}"`);
    if (userInput === "error_test") {
      throw new Error("Simulated service error");
    }
    return `Mocked response to: ${userInput}`;
  };
  console.log('Mocked geminiService.fetchGeminiResponse setup.');
}

function teardown() {
  // Restore the original function
  geminiService.fetchGeminiResponse = originalFetchGeminiResponse;
  console.log('Restored original geminiService.fetchGeminiResponse.');
}

async function testAgentReturnsServiceResponse() {
  console.log('Test: agent should return service response...');
  setup();
  const userInput = "Hello, agent!";
  const chatHistory = [];
  const response = await agent.getAgentResponse(userInput, chatHistory);
  assert.strictEqual(response, "Mocked response to: Hello, agent!", "Test Failed: Agent did not return the mocked service response.");
  console.log('Test Passed: Agent returned service response.');
  teardown();
}

async function testAgentHandlesServiceError() {
  console.log('Test: agent should handle service error gracefully...');
  setup();
  const userInput = "error_test";
  const chatHistory = [];
  const response = await agent.getAgentResponse(userInput, chatHistory);
  assert.strictEqual(response, "Agent: I'm sorry, I encountered an error trying to get a response.", "Test Failed: Agent did not handle error correctly.");
  console.log('Test Passed: Agent handled service error.');
  teardown();
}

// Run tests
async function runTests() {
  try {
    await testAgentReturnsServiceResponse();
    await testAgentHandlesServiceError();
    console.log('All agent tests passed!');
  } catch (error) {
    console.error('Agent Test Suite Failed:', error);
    process.exitCode = 1; // Indicate failure
  }
}

// If this file is run directly, execute the tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests }; // Export for potential use with a test runner
