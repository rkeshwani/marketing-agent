// Placeholder for Gemini API service
// const axios = require('axios'); // Will be needed for actual API calls
// const config = require('../config/config'); // To get API key and endpoint
const { getAllToolSchemas } = require('./toolRegistryService');

/**
 * Fetches a response from the (placeholder) Gemini API.
 * In a real scenario, this function would make an HTTP request to the Gemini API.
 *
 * @param {string} userInput The user's latest message.
 * @param {Array<Object>} chatHistory The entire chat history (might be used for context).
 * @param {Array<Object>} projectAssets Assets associated with the project (optional).
 * @returns {Promise<string|Object>} A promise that resolves to the simulated API response,
 * which can be a string (for text responses) or an object (for tool calls).
 */
async function fetchGeminiResponse(userInput, chatHistory, projectAssets = []) {
  console.log('GeminiService (fetchGeminiResponse): Received input for API call -', userInput);
  console.log('GeminiService (fetchGeminiResponse): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  const tools = getAllToolSchemas();
  console.log('GeminiService (fetchGeminiResponse): Available tools -', tools.map(t => t.name));

  // Simulate an API call delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // TODO: Implement actual API call using axios, passing userInput, chatHistory, projectAssets, and tools.
  // The body of that request would look something like:
  // JSON.stringify({ userInput, chatHistory, projectAssets, tools })

  // --- Mocked Gemini API Response Handling ---

  // Specific case for plan generation (remains unchanged as per subtask instructions)
  if (userInput.startsWith("Based on the following marketing objective:")) {
    console.log('GeminiService (fetchGeminiResponse): Detected plan generation prompt, returning simulated structured plan string.');
    // This response is a string, and generatePlanForObjective expects to parse it.
    return `
PLAN:
- Step 1: Define target audience for ${userInput.match(/Title: "(.*?)"/)[1]}. [API: No, Content: Yes]
- Step 2: Develop key messaging. [API: No, Content: Yes]
- Step 3: Create 3 pieces of initial content. [API: Yes, Content: Yes]
- Step 4: Schedule content posting. [API: Yes, Content: No]

QUESTIONS:
- What is the primary platform for this campaign?
- Are there any existing brand guidelines to follow?
- What is the budget for content creation, if any?
    `.trim();
  }

  // --- General case: Simulate response that could be text or tool_call ---
  // In a real scenario, the response from `await axios.post(...)` would be parsed.
  // const apiResponse = await actualGeminiApiCall(userInput, chatHistory, projectAssets, tools);
  // For now, we simulate this `apiResponse`.

  // Example: Simulate a tool call for a specific input
  if (userInput.toLowerCase().includes("search for assets about dogs")) {
    console.log('GeminiService (fetchGeminiResponse): Simulating tool_call response.');
    // This is the new structure that fetchGeminiResponse can return.
    // The agent will need to handle this object.
    return {
      tool_call: {
        name: "semantic_search_assets",
        arguments: { query: "images of dogs" }
      }
    };
  }

  // Example: Simulate a tool call for image generation
  if (userInput.toLowerCase().includes("create an image of a cat")) {
    console.log('GeminiService (fetchGeminiResponse): Simulating tool_call response for image generation.');
    return {
      tool_call: {
        name: "create_image_asset",
        arguments: { prompt: "A majestic cat sitting on a throne" }
      }
    };
  }

  // Default: Simulate a standard text response
  console.log('GeminiService (fetchGeminiResponse): Simulating text response.');
  // This is also a new structure. Instead of returning a raw string,
  // we return an object with a 'text' property, or the agent can check for string directly.
  // For consistency with tool_call, let's aim for { text: "..." }
  // However, previous tests might expect a direct string.
  // Let's return { text: "..." } and adjust tests if necessary, or make agent handle both.
  // The subtask says "if response.text exists, it should return the response.text".
  // This implies the simulated or actual API returns { text: "..." } or { tool_call: ... }
  // So, this function should return the *content* of response.text, not the object.
  const simulatedText = `Gemini API (placeholder) processed: "${userInput}"`;
  // To adhere to "return response.text", the *mock* API call would result in { text: simulatedText }
  // And then this function would return simulatedText.
  // Let's refine this: The *function* fetchGeminiResponse should return the tool_call object OR the text string.

  // If the (mocked) API call returned { text: "some text" }, we return "some text"
  // If it returned { tool_call: {...} }, we return the tool_call object.

  // The current mock directly returns a string for plan generation. For other cases:
  // Let's assume the "API" (which is this simulation) now produces an object.
  const mockApiResponse = { text: `Gemini API (placeholder) processed: "${userInput}"` }; // Default mock structure

  if (mockApiResponse.tool_call) { // This won't be hit with current mockApiResponse
      return mockApiResponse.tool_call;
  }
  if (mockApiResponse.text) {
      return mockApiResponse.text;
  }
  // Fallback if the response is just a string (to handle plan generation case carefully, though it's handled above)
  return typeof mockApiResponse === 'string' ? mockApiResponse : "Error: Unexpected response structure from Gemini mock.";

}

async function generatePlanForObjective(objective, projectAssets = []) {
  console.log('GeminiService (generatePlanForObjective): Received objective -', objective.title);
  console.log('GeminiService (generatePlanForObjective): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  const prompt = `
Based on the following marketing objective:
Title: "${objective.title}"
Brief: "${objective.brief}"

AVAILABLE_ASSETS:
${projectAssets.length > 0 ? projectAssets.map(asset => `- ${asset.name} (Type: ${asset.type}, Tags: ${asset.tags.join(', ')})`).join('\n') : 'No assets available.'}

Please generate a strategic plan to achieve this objective. The plan should consist of clear, actionable steps.
For each step, consider if it requires:
1. Accessing social media APIs (e.g., for posting, fetching data).
2. Creating new content (e.g., text, images, videos).

If you need more information from the user to create a more effective or complete plan, please list your questions clearly.

Structure your response as follows:
PLAN:
- Step 1: Description of step 1. [API: Yes/No, Content: Yes/No]
- Step 2: Description of step 2. [API: Yes/No, Content: Yes/No]
...

QUESTIONS:
- Question 1?
- Question 2?
...
If you have no questions, write "QUESTIONS: None".
  `.trim();

  // Call the existing fetchGeminiResponse with the detailed prompt
  // For this subtask, fetchGeminiResponse is modified to return a structured string for parsing.
  const geminiResponseString = await fetchGeminiResponse(prompt, [], projectAssets); // Pass projectAssets
  console.log('GeminiService (generatePlanForObjective): Received raw response for parsing:\n', geminiResponseString);


  const planSteps = [];
  const questions = [];
  const lines = geminiResponseString.split('\n');
  let parsingPlan = false;
  let parsingQuestions = false;

  for (const line of lines) {
    if (line.toUpperCase().startsWith('PLAN:')) {
      parsingPlan = true;
      parsingQuestions = false;
      continue;
    }
    if (line.toUpperCase().startsWith('QUESTIONS:')) {
      parsingQuestions = true;
      parsingPlan = false;
      if (line.toUpperCase().includes("NONE")) {
        // If "QUESTIONS: None", we stop and questions array remains empty.
        break;
      }
      continue;
    }

    if (parsingPlan && line.startsWith('- ')) {
      // Basic extraction of step description, removing the [API: ..., Content: ...] part
      planSteps.push(line.substring(2).replace(/\s*\[API:.*, Content:.*\]$/, '').trim());
    } else if (parsingQuestions && line.startsWith('- ')) {
      questions.push(line.substring(2).trim());
    }
  }

  console.log('GeminiService (generatePlanForObjective): Parsed steps -', planSteps);
  console.log('GeminiService (generatePlanForObjective): Parsed questions -', questions);

  return { planSteps, questions };
}

module.exports = {
  fetchGeminiResponse,
  generatePlanForObjective, // Export the new function
  generateProjectContextQuestions,
  structureProjectContextAnswers,
  executePlanStep, // Export the new function
};

// --- New Function: executePlanStep ---
/**
 * Executes a single step of a plan by calling fetchGeminiResponse.
 *
 * @param {string} stepDescription The description of the plan step to execute.
 * @param {Array<Object>} chatHistory The current chat history.
 * @param {Array<Object>} projectAssets Assets related to the project (optional).
 * @returns {Promise<string>} A promise that resolves to the API response for the step.
 */
async function executePlanStep(stepDescription, chatHistory, projectAssets = []) {
  console.log('GeminiService (executePlanStep): Received step for execution -', stepDescription);
  // This function simply leverages fetchGeminiResponse for the execution of a step.
  // In a more complex system, this might involve different types of actions based on step content.
  return fetchGeminiResponse(stepDescription, chatHistory, projectAssets);
}

// --- New Function: generateProjectContextQuestions ---

/**
 * Generates questions to understand a project's context using Gemini.
 * @param {string} projectName The name of the project.
 * @param {string} projectDescription The description of the project.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of question strings.
 */
async function generateProjectContextQuestions(projectName, projectDescription) {
  console.log('GeminiService (generateProjectContextQuestions): Received project details - Name:', projectName);

  const prompt = `
Project Name: "${projectName}"
Project Description: "${projectDescription}"

Based on the project name and description, please generate 3-5 questions to help me understand the project's context more deeply.
These questions should cover:
- The project's relation to my overall brand.
- Any specific branding standards or guidelines I need to adhere to.
- The desired voice and tone for the project's communications.
- The specific feeling or emotion the project aims to evoke in the target audience.

Return ONLY a JSON string array of the questions. For example:
["Question 1?", "Question 2?", "What is the primary goal of this project?"]
  `.trim();

  console.log('GeminiService (generateProjectContextQuestions): Sending prompt to Gemini:\n', prompt);

  try {
    // In a real scenario, fetchGeminiResponse would be a generic function.
    // For this subtask, we'll assume it can handle this prompt and might return a JSON string.
    // We might need to adjust fetchGeminiResponse or add a new specialized function if its
    // current simulation logic interferes. For now, let's proceed.
    const geminiResponseString = await fetchGeminiResponse(prompt, []); // No chat history or assets needed for this

    console.log('GeminiService (generateProjectContextQuestions): Received raw response from Gemini:\n', geminiResponseString);

    // Attempt to parse the response as JSON
    let parsedQuestions = JSON.parse(geminiResponseString);

    if (!Array.isArray(parsedQuestions)) {
      console.error('GeminiService (generateProjectContextQuestions): Parsed response is not an array. Response:', parsedQuestions);
      // Return a default set of questions or an empty array as per requirements
      return ["What are the key objectives for this project?", "Who is the primary target audience?", "Are there any existing brand guidelines or assets I should be aware of?"];
    }

    // Ensure all elements are strings (basic validation)
    parsedQuestions = parsedQuestions.filter(q => typeof q === 'string');

    console.log('GeminiService (generateProjectContextQuestions): Parsed questions successfully:', parsedQuestions);
    return parsedQuestions;

  } catch (error) {
    console.error('GeminiService (generateProjectContextQuestions): Error parsing Gemini response or other issue:', error);
    // Return default questions in case of any error (parsing, API call, etc.)
    return ["What are the key objectives for this project?", "Who is the primary target audience?", "Are there any existing brand guidelines or assets I should be aware of?", "What is the desired tone and voice for this project?"];
  }
}

// --- New Function: structureProjectContextAnswers ---

/**
 * Structures user answers about project context into a JSON object using Gemini.
 * @param {string} projectName The name of the project.
 * @param {string} projectDescription The description of the project.
 * @param {string} userAnswersString A string containing the user's answers to context questions.
 * @returns {Promise<Object>} A promise that resolves to a structured JSON object of the context.
 */
async function structureProjectContextAnswers(projectName, projectDescription, userAnswersString) {
  console.log('GeminiService (structureProjectContextAnswers): Received project details - Name:', projectName);
  console.log('GeminiService (structureProjectContextAnswers): User answers string:', userAnswersString);

  const prompt = `
Project Name: "${projectName}"
Project Description: "${projectDescription}"
User Answers to Context Questions:
"${userAnswersString}"

Based on the project name, description, and the user's answers, please analyze and structure this information into a concise JSON object.
This object should summarize the key aspects of the project's context, including (but not limited to):
- brandIdentity: A summary of how the project relates to the user's overall brand.
- projectVoice: The desired voice and tone for the project.
- desiredFeeling: The feeling or emotion the project should evoke.
- keyPoints: An array of crucial takeaways, requirements, or constraints mentioned by the user.

Return ONLY the JSON object. For example:
{
  "brandIdentity": "The project is a core part of our new 'Innovate Everyday' campaign and should reflect our company's commitment to cutting-edge solutions.",
  "projectVoice": "Professional yet approachable, inspiring confidence.",
  "desiredFeeling": "Users should feel empowered and excited about the possibilities.",
  "keyPoints": ["Adherence to the new blue color palette is mandatory.", "Target audience is young professionals aged 25-35.", "Launch date is critical."]
}
  `.trim();

  console.log('GeminiService (structureProjectContextAnswers): Sending prompt to Gemini:\n', prompt);

  try {
    // Assuming fetchGeminiResponse can handle this prompt and is expected to return a JSON string.
    const geminiResponseString = await fetchGeminiResponse(prompt, []); // No chat history or assets

    console.log('GeminiService (structureProjectContextAnswers): Received raw response from Gemini:\n', geminiResponseString);

    // Attempt to parse the response as JSON
    let structuredContext = JSON.parse(geminiResponseString);

    if (typeof structuredContext !== 'object' || structuredContext === null || Array.isArray(structuredContext)) {
      console.error('GeminiService (structureProjectContextAnswers): Parsed response is not a valid object. Response:', structuredContext);
      // Return a default error structure or an empty object
      return { error: "Failed to structure project context.", details: "Response was not a valid JSON object." };
    }

    console.log('GeminiService (structureProjectContextAnswers): Structured context successfully:', structuredContext);
    return structuredContext;

  } catch (error) {
    console.error('GeminiService (structureProjectContextAnswers): Error parsing Gemini response or other issue:', error);
    // Return default error structure in case of any error
    return { error: "Failed to structure project context.", details: error.message };
  }
}
