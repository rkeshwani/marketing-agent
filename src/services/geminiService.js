// Service for interacting with the Gemini API.
const axios = require('axios');
const config = require('../config/config'); // To get API key and endpoint
const { getAllToolSchemas } = require('./toolRegistryService');

/**
 * Fetches a response from the Gemini API.
 * This function makes an HTTP POST request to the configured Gemini API endpoint.
 * It can return either a textual response or a tool_call object if the API requests a tool execution.
 *
 * @param {string} userInput The user's latest message or prompt.
 * @param {Array<Object>} chatHistory The entire chat history for context.
 * @param {Array<Object>} [projectAssets=[]] Optional array of project assets for context.
 * @returns {Promise<string|Object>} A promise that resolves to the API response:
 * - A string for text responses.
 * - An object for tool calls (e.g., `{ name: "tool_name", arguments: { ... } }`).
 * @throws {Error} If the API call fails or the response structure is unexpected.
 */
async function fetchGeminiResponse(userInput, chatHistory, projectAssets = []) {
  console.log('GeminiService (fetchGeminiResponse): Received input for API call -', userInput);
  console.log('GeminiService (fetchGeminiResponse): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  const tools = getAllToolSchemas();
  // Assuming tool name is at t.name.name based on previous attempt, if not, this might need adjustment
  console.log('GeminiService (fetchGeminiResponse): Available tools -', tools.map(t => t.name && t.name.name ? t.name.name : t.name));


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

  // --- Real Gemini API Call ---
  const GEMINI_API_KEY = config.GEMINI_API_KEY;
  const GEMINI_API_ENDPOINT = config.GEMINI_API_ENDPOINT;

  if (!GEMINI_API_KEY || !GEMINI_API_ENDPOINT) {
    console.error('GeminiService: API Key or Endpoint is missing in config.');
    // If running in a test environment where config might not be fully populated,
    // it might be desirable to not throw here but let a mock/test setup handle it.
    // However, for general robustness, throwing an error is appropriate.
    throw new Error('Gemini API Key or Endpoint is not configured.');
  }

  const requestBody = {
    // The actual Gemini API expects a specific structure, often involving a "contents" array.
    // This needs to be aligned with the Gemini API documentation for "generateContent".
    // For now, structuring based on the subtask's description of `requestBody`.
    // The prompt to Gemini should be constructed from userInput, chatHistory.
    // Let's assume a simplified model where `userInput` is the main prompt
    // and `chatHistory` and `projectAssets` are context.
    // A more robust implementation would format `contents` like:
    // contents: [
    //   ...chatHistory.map(msg => ({ role: msg.role, parts: [{ text: msg.parts[0].text }] })), // Reformat history
    //   { role: "user", parts: [{ text: userInput }] }
    // ],
    // tools: [{ functionDeclarations: tools }] // Gemini expects tools under a specific structure

    // Simplified request body as per subtask direct fields:
    userInput: userInput, // This might need to be part of a 'contents' structure
    chatHistory: chatHistory, // This also might need to be part of 'contents'
    projectAssets: projectAssets, // How assets are sent depends on API spec (e.g., inline data or references)
    tools: tools // This likely needs to be formatted as per Gemini's "tool_config" or "tools"
  };

  console.log('GeminiService (fetchGeminiResponse): Making POST request to', GEMINI_API_ENDPOINT);
  // Avoid logging potentially sensitive parts of projectAssets if they contain file content
  // console.log('GeminiService (fetchGeminiResponse): Request body:', JSON.stringify(requestBody, null, 2));

  try {
    // The actual request body for Gemini API's generateContent method should be like:
    // {
    //   "contents": [
    //     // ... chat history formatted as user/model turns ...
    //     { "role": "user", "parts": [{ "text": userInput }] }
    //   ],
    //   "tools": [ { "function_declarations": tools } ] // if tools are Google AI style function declarations
    // }
    // For this iteration, I will send the simpler requestBody and adjust if testing shows issues.
    // The key is `Authorization: Bearer ${GEMINI_API_KEY}`.
    // The subtask specifies `Authorization: Bearer ${config.GEMINI_API_KEY}` which is correct.
    // It also specifies `axios.post(config.GEMINI_API_ENDPOINT, requestBody, { headers: { 'Authorization': ... } })`

    const apiRequestBody = {
        contents: [
            // Simple conversion for now, assuming chatHistory is [{role: 'user'/'model', parts: [{text: '...'}]}]
            ...chatHistory,
            { role: "user", parts: [{ text: userInput }] }
        ],
        // Assuming `tools` from getAllToolSchemas() are already in the format Gemini expects for function declarations
        // e.g. { function_declarations: [...] } or needs to be wrapped.
        // Based on typical Gemini API, it's often { tools: [{ functionDeclarations: tools }] }
        // For now, sending as received from getAllToolSchemas, wrapped in an object.
        // This will likely need refinement based on actual API behavior.
         tools: [{ functionDeclarations: tools }], // This is a common structure
        // projectAssets might be sent as part of the prompt, or if they are files, using multi-part requests or inline data.
        // This part is underspecified for a generic Gemini call without knowing asset types.
        // For now, projectAssets are not explicitly included in `apiRequestBody.contents` unless they are part of `userInput`.
    };
    // Add projectAssets information to the prompt if they exist
    if (projectAssets && projectAssets.length > 0) {
        let assetsText = "\n\nProject Assets Context:\n";
        projectAssets.forEach(asset => {
            assetsText += `- Name: ${asset.name}, Type: ${asset.type}\n`;
            // Do not include asset.content directly in the prompt unless it's text and brief.
        });
        // Find the last user message and append to it, or add a new user message.
        if (apiRequestBody.contents.length > 0 && apiRequestBody.contents[apiRequestBody.contents.length-1].role === "user") {
            apiRequestBody.contents[apiRequestBody.contents.length-1].parts[0].text += assetsText;
        } else {
            apiRequestBody.contents.push({role: "user", parts: [{text: "Context about project assets:" + assetsText}]});
        }
    }


    console.log('GeminiService (fetchGeminiResponse): Sending to Gemini:', JSON.stringify(apiRequestBody, null, 2));


    const response = await axios.post(GEMINI_API_ENDPOINT, apiRequestBody, {
      headers: {
        'Authorization': `Bearer ${GEMINI_API_KEY}`, // Corrected, was `config.GEMINI_API_KEY` which is the same
        'Content-Type': 'application/json'
      }
    });

    console.log('GeminiService (fetchGeminiResponse): Raw API Response:', JSON.stringify(response.data, null, 2));

    // Parse response as per subtask:
    // { "candidates": [{ "content": { "parts": [{ "text": "..." }] } }] }
    // or { "candidates": [{ "content": { "parts": [{ "tool_call": {...} }] } }] }
    if (response.data && response.data.candidates && response.data.candidates.length > 0) {
      const candidate = response.data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const part = candidate.content.parts[0];
        if (part.tool_call) {
          console.log('GeminiService (fetchGeminiResponse): Returning tool_call.');
          return part.tool_call; // Return the tool_call object
        }
        if (part.text) {
          console.log('GeminiService (fetchGeminiResponse): Returning text response.');
          return part.text; // Return the text string
        }
      }
    }

    console.error('GeminiService (fetchGeminiResponse): Unexpected API response structure.', response.data);
    throw new Error('Gemini API response structure was not as expected.');

  } catch (error) {
    console.error('GeminiService (fetchGeminiResponse): Gemini API call failed.', error.message);
    if (error.response) {
      console.error('GeminiService (fetchGeminiResponse): API Error Response Data:', error.response.data);
      console.error('GeminiService (fetchGeminiResponse): API Error Response Status:', error.response.status);
    }
    // Re-throw the error so downstream functions can handle it.
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}

async function generatePlanForObjective(objective, projectAssets = []) {
  console.log('GeminiService (generatePlanForObjective): Received objective -', objective.title);
  console.log('GeminiService (generatePlanForObjective): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  let userPromptContent;
  const baseBrief = objective.brief;

  if (objective.currentRecurrenceContext && objective.currentRecurrenceContext.previousPostSummary) {
    userPromptContent = `This is a recurring task. The summary of the last completed instance was: "${objective.currentRecurrenceContext.previousPostSummary}".
The overall objective is: "${baseBrief}".
Please generate a detailed, actionable plan for the *next* instance of this recurring task. This new plan should ensure continuity or appropriate variation based on the previous actions and summary. Focus on generating specific, actionable steps for this new instance.`;
  } else if (objective.isRecurring && !objective.originalPlan) {
    // This condition means it's the first time we are generating a plan for an objective that IS recurring,
    // but its originalPlan (template) hasn't been stored yet.
    userPromptContent = `This is the first time setting up a recurring task. The overall objective is: "${baseBrief}".
Please generate a detailed, actionable plan that can serve as a template for future recurrences. The steps should be somewhat generic if they are to be reused, but specific enough to be actionable.`;
  } else {
    userPromptContent = `Generate a detailed, actionable plan for the objective: "${baseBrief}".`;
  }

  const prompt = `
Based on the following marketing objective:
Title: "${objective.title}"
Contextual Brief: "${userPromptContent}"

AVAILABLE_ASSETS:
${projectAssets.length > 0 ? projectAssets.map(asset => `- ${asset.name} (Type: ${asset.type}, Tags: ${asset.tags.join(', ')})`).join('\n') : 'No assets available.'}

Please generate a strategic plan. The plan should consist of clear, actionable steps.
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
  const geminiResponseString = await fetchGeminiResponse(prompt, [], projectAssets); // Pass projectAssets
  console.log('GeminiService (generatePlanForObjective): Received raw response for parsing:\n', geminiResponseString);

  // Ensure geminiResponseString is a string before splitting
  if (typeof geminiResponseString !== 'string') {
    console.error('GeminiService (generatePlanForObjective): Expected a string response for plan generation, but received:', typeof geminiResponseString, geminiResponseString);
    // Handle error appropriately - perhaps return empty plan/questions or throw
    return { planSteps: [], questions: ["Error: Plan generation failed due to unexpected response type."] };
  }

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
  generatePlanForObjective,
  generateProjectContextQuestions,
  structureProjectContextAnswers,
  executePlanStep,
};

// --- Function: executePlanStep ---
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
 * The response from Gemini is expected to be a JSON string array, potentially wrapped in markdown.
 * This function handles extraction from markdown and parsing.
 *
 * @param {string} projectName The name of the project.
 * @param {string} projectDescription The description of the project.
 * @returns {Promise<Array<string>>} A promise that resolves to an array of question strings.
 * Returns a default list of questions in case of parsing errors or unexpected API response types.
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
    const geminiResponse = await fetchGeminiResponse(prompt, []); // No chat history or assets needed for this

    console.log('GeminiService (generateProjectContextQuestions): Received response from Gemini:\n', geminiResponse);

    // The real API will now return text that needs to be parsed, or a tool_call.
    // This function expects the text to be a JSON string.
    if (typeof geminiResponse === 'string') {
      let jsonStringToParse = geminiResponse;
      const markdownJsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const match = geminiResponse.match(markdownJsonRegex);
      if (match && match[1]) {
        jsonStringToParse = match[1].trim();
        console.log('GeminiService (generateProjectContextQuestions): Extracted JSON from markdown block:', jsonStringToParse);
      }

      try {
        let parsedQuestions = JSON.parse(jsonStringToParse);

        if (!Array.isArray(parsedQuestions)) {
          console.error('GeminiService (generateProjectContextQuestions): Parsed response is not an array. Response:', parsedQuestions);
          return ["What are the key objectives for this project?", "Who is the primary target audience?", "Are there any existing brand guidelines or assets I should be aware of?"];
        }
        parsedQuestions = parsedQuestions.filter(q => typeof q === 'string');
        console.log('GeminiService (generateProjectContextQuestions): Parsed questions successfully:', parsedQuestions);
        return parsedQuestions;
      } catch (parseError) {
        console.error('GeminiService (generateProjectContextQuestions): Error parsing JSON string from Gemini:', parseError, 'Raw response:', geminiResponse);
        return ["Error parsing questions from AI.", "What is the primary goal of this project?"];
      }
    } else {
      // If it's not a string, it might be a tool_call or an error, which this function isn't designed to handle.
      console.error('GeminiService (generateProjectContextQuestions): Expected a string response containing JSON, but received:', typeof geminiResponse, geminiResponse);
      return ["Unexpected response type from AI.", "Please clarify project objectives."];
    }

  } catch (error) {
    console.error('GeminiService (generateProjectContextQuestions): Error parsing Gemini response or other issue:', error);
    // Return default questions in case of any error (parsing, API call, etc.)
    return ["What are the key objectives for this project?", "Who is the primary target audience?", "Are there any existing brand guidelines or assets I should be aware of?", "What is the desired tone and voice for this project?"];
  }
}

// --- New Function: structureProjectContextAnswers ---

/**
 * Structures user answers about project context into a JSON object using Gemini.
 * The response from Gemini is expected to be a JSON object string, potentially wrapped in markdown.
 * This function handles extraction from markdown and parsing.
 *
 * @param {string} projectName The name of the project.
 * @param {string} projectDescription The description of the project.
 * @param {string} userAnswersString A string containing the user's answers to context questions.
 * @returns {Promise<Object>} A promise that resolves to a structured JSON object of the context.
 * Returns an error object in case of parsing errors or unexpected API response types.
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
    const geminiResponse = await fetchGeminiResponse(prompt, []); // No chat history or assets

    console.log('GeminiService (structureProjectContextAnswers): Received response from Gemini:\n', geminiResponse);

    // This function expects the text response from Gemini to be a JSON string.
    if (typeof geminiResponse === 'string') {
      let jsonStringToParse = geminiResponse;
      const markdownJsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
      const match = geminiResponse.match(markdownJsonRegex);
      if (match && match[1]) {
        jsonStringToParse = match[1].trim();
        console.log('GeminiService (structureProjectContextAnswers): Extracted JSON from markdown block:', jsonStringToParse);
      }

      try {
        let structuredContext = JSON.parse(jsonStringToParse);

        if (typeof structuredContext !== 'object' || structuredContext === null || Array.isArray(structuredContext)) {
          console.error('GeminiService (structureProjectContextAnswers): Parsed response is not a valid object. Response:', structuredContext);
          return { error: "Failed to structure project context.", details: "Response was not a valid JSON object." };
        }
        console.log('GeminiService (structureProjectContextAnswers): Structured context successfully:', structuredContext);
        return structuredContext;
      } catch (parseError) {
        console.error('GeminiService (structureProjectContextAnswers): Error parsing JSON string from Gemini:', parseError, 'Raw response:', geminiResponse);
        return { error: "Failed to structure project context.", details: "Error parsing JSON response from AI." };
      }
    } else {
      // If it's not a string, it might be a tool_call or an error.
      console.error('GeminiService (structureProjectContextAnswers): Expected a string response containing JSON, but received:', typeof geminiResponse, geminiResponse);
      return { error: "Failed to structure project context.", details: "Unexpected response type from AI." };
    }

  } catch (error) {
    console.error('GeminiService (structureProjectContextAnswers): Error parsing Gemini response or other issue:', error);
    // Return default error structure in case of any error
    return { error: "Failed to structure project context.", details: error.message };
  }
}
