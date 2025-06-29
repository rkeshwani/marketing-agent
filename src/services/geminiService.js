// Service for interacting with the Gemini API.
const axios = require('axios');
const config = require('../config/config'); // To get API key and endpoint
const { getAllToolSchemas } = require('./toolRegistryService');
const { getPrompt } = require('./promptProvider'); // Assuming promptProvider.js is in the same directory

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
// This is an async generator function
async function* fetchGeminiResponse(userInput, chatHistory, projectAssets = [], stream = false) {
  console.log('GeminiService (fetchGeminiResponse): Received input for API call -', userInput, 'Stream:', stream);
  console.log('GeminiService (fetchGeminiResponse): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  const tools = getAllToolSchemas();
  console.log('GeminiService (fetchGeminiResponse): Available tools -', tools.map(t => t.name && t.name.name ? t.name.name : t.name));

  const GEMINI_API_KEY = config.GEMINI_API_KEY;
  const GEMINI_API_ENDPOINT = config.GEMINI_API_ENDPOINT;

  if (!GEMINI_API_KEY || !GEMINI_API_ENDPOINT) {
    console.error('GeminiService: API Key or Endpoint is missing in config.');
    throw new Error('Gemini API Key or Endpoint is not configured.');
  }

  const apiRequestBody = {
    contents: [
      ...chatHistory.map(item => {
        let currentContent;
        let role;
        if (item.role && item.parts && item.parts.length > 0 && typeof item.parts[0].text !== 'undefined') {
          role = item.role;
          currentContent = item.parts[0].text;
        } else {
          role = (item.speaker === 'agent' || item.speaker === 'system') ? 'model' : 'user';
          currentContent = item.content;
        }
        if (typeof currentContent === 'object' && currentContent !== null) {
          currentContent = (currentContent.message && currentContent.stepDescription)
            ? `${currentContent.stepDescription}\n\n${currentContent.message}`
            : JSON.stringify(currentContent);
        } else if (typeof currentContent !== 'string') {
          currentContent = String(currentContent || '');
        }
        return { role: role, parts: [{ text: currentContent }] };
      }),
      {
        role: "user",
        parts: [{
          text: (typeof userInput === 'object' && userInput !== null)
                ? JSON.stringify(userInput)
                : String(userInput || '')
        }]
      }
    ],
    tools: [{ functionDeclarations: tools }],
  };

  if (projectAssets && projectAssets.length > 0) {
    let assetsText = "\n\nProject Assets Context:\n";
    projectAssets.forEach(asset => {
      assetsText += `- Name: ${asset.name}, Type: ${asset.type}\n`;
    });
    const lastContent = apiRequestBody.contents[apiRequestBody.contents.length - 1];
    if (lastContent && lastContent.role === "user" && lastContent.parts && lastContent.parts.length > 0) {
      lastContent.parts[0].text += assetsText;
    } else {
      apiRequestBody.contents.push({ role: "user", parts: [{ text: "Context about project assets:" + assetsText }] });
    }
  }

  const endpointSuffix = stream ? ':streamGenerateContent?alt=sse' : ':generateContent';
  const fullEndpoint = `${GEMINI_API_ENDPOINT}${endpointSuffix}&key=${GEMINI_API_KEY}`;

  console.log('GeminiService (fetchGeminiResponse): Sending to Gemini:', JSON.stringify(apiRequestBody, null, 2));
  console.log('GeminiService (fetchGeminiResponse): Full Endpoint:', fullEndpoint);


  try {
    if (stream) {
      const response = await axios.post(fullEndpoint, apiRequestBody, {
        headers: { 'Content-Type': 'application/json' },
        responseType: 'stream'
      });

      const dataStream = response.data;
      let buffer = '';
      for await (const chunk of dataStream) {
        buffer += chunk.toString();
        let eolIndex;
        // The Gemini stream with `alt=sse` should provide SSE formatted chunks.
        while ((eolIndex = buffer.indexOf('\n\n')) !== -1) {
            const messageLine = buffer.substring(0, eolIndex);
            buffer = buffer.substring(eolIndex + 2);

            if (messageLine.startsWith('data: ')) {
                const jsonPayload = messageLine.substring(6).trim();
                if (jsonPayload) {
                    try {
                        const parsedChunk = JSON.parse(jsonPayload);
                        if (parsedChunk.candidates && parsedChunk.candidates.length > 0) {
                            const candidate = parsedChunk.candidates[0];
                            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                                const part = candidate.content.parts[0];
                                if (part.text) {
                                    yield { text: part.text };
                                } else if (part.tool_call) {
                                    yield { tool_call: part.tool_call };
                                    return;
                                }
                            }
                        } else if (parsedChunk.error) { // Handle cases where the stream itself sends an error object
                           console.error('GeminiService (fetchGeminiResponse): Error in stream data:', parsedChunk.error);
                           throw new Error(`Gemini API Stream Error: ${parsedChunk.error.message || JSON.stringify(parsedChunk.error)}`);
                        }
                    } catch (e) {
                        console.error('GeminiService (fetchGeminiResponse): Error parsing JSON from stream:', e, "Payload:", jsonPayload);
                        // Do not yield here, as it's a parsing error on our side.
                    }
                }
            }
        }
      // Process any remaining data in the buffer after the stream ends (if any)
      // This is less likely with `\n\n` as a delimiter for SSE but good for robustness
      if (buffer.startsWith('data: ')) {
          const jsonPayload = buffer.substring(6).trim();
          if (jsonPayload) {
              try {
                  const parsedChunk = JSON.parse(jsonPayload);
                  if (parsedChunk.candidates && parsedChunk.candidates.length > 0) {
                      const candidate = parsedChunk.candidates[0];
                      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                          const part = candidate.content.parts[0];
                          if (part.text) {
                              yield { text: part.text };
                          } else if (part.tool_call) {
                              yield { tool_call: part.tool_call };
                              return; // End generation after a tool call
                          }
                      }
                  } else if (parsedChunk.error) {
                     console.error('GeminiService (fetchGeminiResponse): Error in final stream data fragment:', parsedChunk.error);
                     throw new Error(`Gemini API Stream Error: ${parsedChunk.error.message || JSON.stringify(parsedChunk.error)}`);
                  }
              } catch (e) {
                  console.error('GeminiService (fetchGeminiResponse): Error parsing final JSON fragment from stream:', e, "Payload:", jsonPayload);
                  // Potentially throw or handle as a failed stream if critical
              }
          }
      } // This closes the for-await loop for the stream
    } else { // Non-streaming request
      const response = await axios.post(fullEndpoint, apiRequestBody, {
        headers: { 'Content-Type': 'application/json' }
      });
      // console.log('GeminiService (fetchGeminiResponse): Raw API Response (non-stream):', JSON.stringify(response.data, null, 2));
      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        const candidate = response.data.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const part = candidate.content.parts[0];
          if (part.tool_call) {
            // console.log('GeminiService (fetchGeminiResponse): Returning tool_call.');
            yield part.tool_call;
            return;
          }
          if (part.text) {
            // console.log('GeminiService (fetchGeminiResponse): Returning text response.');
            yield { text: part.text };
            return;
          }
        }
      } else if (response.data && response.data.error) { // Handle cases where the non-streamed response is an error object
        console.error('GeminiService (fetchGeminiResponse): Gemini API Error (non-stream):', response.data.error);
        throw new Error(`Gemini API Error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
      }
      console.error('GeminiService (fetchGeminiResponse): Unexpected API response structure (non-stream).', response.data);
      throw new Error('Gemini API response structure was not as expected (non-stream).');
    }
  } catch (error) {
    console.error('GeminiService (fetchGeminiResponse): Gemini API call failed.', error.message);
    if (error.response) {
      // console.error('GeminiService (fetchGeminiResponse): API Error Response Data:', error.response.data);
      // console.error('GeminiService (fetchGeminiResponse): API Error Response Status:', error.response.status);
      if (error.response.data && typeof error.response.data.on === 'function') { // Check if data is a stream
        let errorBody = '';
        try {
            for await (const chunk of error.response.data) { // Consume the error stream
                errorBody += chunk;
            }
            console.error('GeminiService (fetchGeminiResponse): API Error Stream Body:', errorBody);
            // Try to parse it as JSON, as Gemini often returns JSON errors even on streams
            try {
                const parsedError = JSON.parse(errorBody);
                if (parsedError.error && parsedError.error.message) {
                    throw new Error(`Gemini API Stream Error: ${parsedError.error.message}`);
                }
            } catch (parseErr) {
                // If not JSON, use the raw body
            }
            throw new Error(`Gemini API Stream Error: ${errorBody || error.message}`);
        } catch (streamReadError) {
            console.error('GeminiService (fetchGeminiResponse): Could not read error stream body:', streamReadError);
            throw new Error(`Gemini API call failed: ${error.message} (and error reading stream body)`);
        }
      } else if (error.response.data && error.response.data.error && error.response.data.error.message) {
        // Handle JSON error response from non-streaming or already buffered stream error
        throw new Error(`Gemini API Error: ${error.response.data.error.message}`);
      }
    }
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
}


async function generatePlanForObjective(objective, projectAssets = []) {
  // console.log('GeminiService (generatePlanForObjective): Received objective -', objective.title);
  console.log('GeminiService (generatePlanForObjective): Received project assets:', projectAssets.length > 0 ? projectAssets.map(a => a.name) : 'No assets');

  let userPromptContent;
  const baseBrief = objective.brief;

  if (objective.currentRecurrenceContext && objective.currentRecurrenceContext.previousPostSummary) {
      userPromptContent = await getPrompt('services/geminiService/user_prompt_recurring_with_summary', {
          previousPostSummary: objective.currentRecurrenceContext.previousPostSummary,
          baseBrief: baseBrief
      });
  } else if (objective.isRecurring && !objective.originalPlan) {
      userPromptContent = await getPrompt('services/geminiService/user_prompt_recurring_first_time', {
          baseBrief: baseBrief
      });
  } else {
      userPromptContent = await getPrompt('services/geminiService/user_prompt_standard_objective', {
          baseBrief: baseBrief
      });
  }

  const availableAssetsString = projectAssets.length > 0 ? projectAssets.map(asset => `- ${asset.name} (Type: ${asset.type}, Tags: ${asset.tags.join(', ')})`).join('\n') : 'No assets available.';
  const prompt = await getPrompt('services/geminiService/generate_plan_for_objective', {
      objectiveTitle: objective.title,
      userPromptContent: userPromptContent,
      availableAssets: availableAssetsString
  });

  // Call the existing fetchGeminiResponse with the detailed prompt
  try {
    const geminiResponseString = await fetchGeminiResponse(prompt, [], projectAssets); // Pass projectAssets
    console.log('GeminiService (generatePlanForObjective): Received raw response for parsing:\n', geminiResponseString);

    // Ensure geminiResponseString is a string before splitting
    if (typeof geminiResponseString !== 'string') {
      console.error('GeminiService (generatePlanForObjective): Expected a string response for plan generation, but received:', typeof geminiResponseString, geminiResponseString);
      return {
        planSteps: [],
        questions: ["Error: Plan generation failed due to an unexpected internal response type. Please try again."],
        planError: true,
        errorMessageForUser: "I received an unexpected internal response while trying to generate the plan. Would you like to try again?",
        canRetryPlanGeneration: true
      };
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
          break;
        }
        continue;
      }

      if (parsingPlan && line.startsWith('- ')) {
        planSteps.push(line.substring(2).replace(/\s*\[API:.*, Content:.*\]$/, '').trim());
      } else if (parsingQuestions && line.startsWith('- ')) {
        questions.push(line.substring(2).trim());
      }
    }

    console.log('GeminiService (generatePlanForObjective): Parsed steps -', planSteps);
    console.log('GeminiService (generatePlanForObjective): Parsed questions -', questions);

    return { planSteps, questions, planError: false }; // Indicate success

  } catch (error) {
    console.error('GeminiService (generatePlanForObjective): Error calling fetchGeminiResponse or parsing its result:', error);
    const userFriendlyMessage = `I encountered an issue while trying to generate the plan (details: ${error.message}). Would you like to try again?`;
    return {
      planSteps: [],
      questions: [userFriendlyMessage], // Put the user-friendly message here for now
      planError: true,
      errorMessageForUser: userFriendlyMessage,
      canRetryPlanGeneration: true
    };
  }
}

module.exports = {
  fetchGeminiResponse, // Now an async generator
  generatePlanForObjective,
  generateProjectContextQuestions,
  structureProjectContextAnswers,
  executePlanStep, // Ensure this is still exported correctly
};

// --- Function: executePlanStep ---
/**
 * Executes a single step of a plan by calling fetchGeminiResponse.
 *
 * @param {string} stepDescription The description of the plan step to execute.
 * @param {Array<Object>} chatHistory The current chat history.
 * @param {Array<Object>} [projectAssets=[]] Optional array of project assets for context.
 * @param {Object} [objectiveDetails={}] Optional object containing objective title and brief.
 * @returns {Promise<string|Object>} A promise that resolves to the API response for the step.
 */
async function executePlanStep(stepDescription, chatHistory, projectAssets = [], objectiveDetails = {}) { // Modified signature
  console.log('GeminiService (executePlanStep): Received step for execution -', stepDescription);
  console.log('GeminiService (executePlanStep): Objective details - Title:', objectiveDetails.title, 'Brief:', objectiveDetails.brief);

  // Construct the detailed prompt for step execution
  const executionPrompt = await getPrompt('services/geminiService/execute_plan_step_prompt', {
      stepDescription: stepDescription,
      objectiveTitle: objectiveDetails.title || "No overall objective title provided",
      objectiveBrief: objectiveDetails.brief || "No project brief provided"
  });

  // Pass the constructed prompt as userInput to fetchGeminiResponse
  return fetchGeminiResponse(executionPrompt, chatHistory, projectAssets);
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

  const prompt = await getPrompt('services/geminiService/generate_project_context_questions', {
      projectName: projectName,
      projectDescription: projectDescription
  });

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

  const prompt = await getPrompt('services/geminiService/structure_project_context_answers', {
      projectName: projectName,
      projectDescription: projectDescription,
      userAnswersString: userAnswersString
  });

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
