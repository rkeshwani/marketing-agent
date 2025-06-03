// Import the placeholder Gemini service
const geminiService = require('./services/geminiService'); // Using require for Node.js commonJS modules by default

/**
 * Gets the agent's response.
 * This function will take user input and chat history,
 * then call the Gemini service to get a response.
 *
 * @param {string} userInput The user's latest message.
 * @param {Array<Object>} chatHistory The entire chat history.
 * @returns {Promise<string>} A promise that resolves to the agent's response.
 */
async function getAgentResponse(userInput, chatHistory) {
  console.log('Agent: Received input -', userInput);
  // For now, we'll just pass the user input to the geminiService.
  // Later, we might want to pass the whole chatHistory or a processed version of it.
  try {
    const response = await geminiService.fetchGeminiResponse(userInput, chatHistory);
    return response;
  } catch (error) {
    console.error('Agent: Error fetching response from Gemini service:', error);
    return "Agent: I'm sorry, I encountered an error trying to get a response.";
  }
}

module.exports = {
  getAgentResponse,
};
