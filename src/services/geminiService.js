// Placeholder for Gemini API service
// const axios = require('axios'); // Will be needed for actual API calls
// const config = require('../config/config'); // To get API key and endpoint

/**
 * Fetches a response from the (placeholder) Gemini API.
 * In a real scenario, this function would make an HTTP request to the Gemini API.
 *
 * @param {string} userInput The user's latest message.
 * @param {Array<Object>} chatHistory The entire chat history (might be used for context).
 * @param {Array<Object>} projectAssets Assets associated with the project (optional).
 * @returns {Promise<string>} A promise that resolves to the simulated API response.
 */
async function fetchGeminiResponse(userInput, chatHistory, projectAssets = []) {
  console.log('GeminiService (fetchGeminiResponse): Received input for API call -', userInput);
  // console.log('GeminiService: Current chat history for context:', chatHistory); // For debugging
  console.log('GeminiService (fetchGeminiResponse): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  // Simulate an API call delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // TODO: Implement actual API call using axios
  // For the purpose of generatePlanForObjective, we will temporarily make this function return
  // a structured string that generatePlanForObjective can parse.
  // In a real scenario, this function would genuinely call the Gemini API with the prompt it receives.

  if (userInput.startsWith("Based on the following marketing objective:")) {
    // This is a hacky way to identify the call from generatePlanForObjective
    // In a real implementation, fetchGeminiResponse would just take the prompt and call the API.
    // The structured response would come from the actual Gemini API.
    console.log('GeminiService (fetchGeminiResponse): Detected plan generation prompt, returning simulated structured plan.');
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

  // Original placeholder response for other calls (e.g., chat)
  const simulatedResponse = `Gemini API (placeholder) processed: "${userInput}"`;

  // 1. Construct the request payload based on Gemini API requirements.
  //    This might involve formatting the chatHistory and userInput.
  // 2. Make a POST request using axios:
  //    const response = await axios.post(config.GEMINI_API_ENDPOINT, payload, {
  //      headers: { 'Authorization': `Bearer ${config.GEMINI_API_KEY}` }
  //    });
  // 3. Parse the response from the API (response.data) and return the relevant part.
  // 4. Implement proper error handling (try-catch around the axios call).

  console.log('GeminiService: Returning simulated response.');
  return simulatedResponse;
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
};
