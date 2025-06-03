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
  generateProjectContextQuestions,
  structureProjectContextAnswers,
};

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
