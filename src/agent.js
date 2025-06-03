// Import the placeholder Gemini service
// Using require for Node.js commonJS modules by default
const geminiService = require('./services/geminiService');
// We need both functions, so we can destructure or use geminiService.functionName
// For clarity with the subtask, let's assume we'll use geminiService.generatePlanForObjective
// and geminiService.fetchGeminiResponse. No change to import line needed if using dot notation.
// If we wanted to destructure:
// const { fetchGeminiResponse, generatePlanForObjective } = require('./services/geminiService');


/**
 * Gets the agent's response.
 * This function will take user input and chat history,
 * then call the Gemini service to get a response.
 *
 * @param {string} userInput The user's latest message.
 * @param {Array<Object>} chatHistory The entire chat history.
 * @param {string} objectiveId The ID of the current objective.
 * @returns {Promise<string>} A promise that resolves to the agent's response.
 */
async function getAgentResponse(userInput, chatHistory, objectiveId) {
  console.log(`Agent: Received input - "${userInput}" for objective ID - ${objectiveId}`);

  if (!objectiveId) {
    console.error('Agent: Objective ID not provided to getAgentResponse.');
    return "Agent: Objective context is missing. Cannot process request.";
  }

  const objective = dataStore.findObjectiveById(objectiveId);

  if (!objective) {
    console.error(`Agent: Objective with ID ${objectiveId} not found.`);
    return "Agent: Objective not found. Cannot process request.";
  }

  if (!objective.plan || objective.plan.status !== 'approved') {
    let message = "It looks like there's a plan that needs your attention. ";
    if (!objective.plan || !objective.plan.status) {
        message += "A plan has not been initialized yet. Please try selecting the objective again, which may trigger initialization.";
    } else if (objective.plan.status === 'pending_approval') {
        message += "Please approve the current plan before we proceed with this objective.";
    } else {
        message += `The current plan status is '${objective.plan.status}'. It needs to be 'approved' to continue.`;
    }
    console.log(`Agent: Plan not approved for objective ${objectiveId}. Status: ${objective.plan ? objective.plan.status : 'N/A'}`);
    return message;
  }

  // Plan is approved, commence execution or continue conversation
  console.log(`Agent: Plan approved for objective ${objectiveId}.`);

  // Fetch project assets early as they might be needed for step execution or conversational fallback
  const project = dataStore.findProjectById(objective.projectId);
  const projectAssets = project ? project.assets : [];

  // Execute next step if plan is in progress
  let currentStepIndex = objective.plan.currentStepIndex === undefined ? 0 : objective.plan.currentStepIndex;

  if (currentStepIndex < objective.plan.steps.length) {
    const currentStep = objective.plan.steps[currentStepIndex];
    console.log(`Agent: Executing step ${currentStepIndex + 1}: ${currentStep}`);

    // Call the new service function to execute the step
    const stepExecutionResult = await geminiService.executePlanStep(currentStep, objective.chatHistory, projectAssets);

    objective.plan.currentStepIndex = currentStepIndex + 1;
    // Note: chatHistory for the objective is not updated with stepExecutionResult here.
    // This would typically be handled by appending user message (step) and agent response (stepExecutionResult)
    // to chatHistory before this call if we want to persist the execution interaction.
    // For now, following the subtask's direct instructions.
    dataStore.updateObjectiveById(objectiveId, objective.title, objective.brief, objective.plan, objective.chatHistory);

    return {
      message: stepExecutionResult,
      currentStep: currentStepIndex, // Return the index of the step just processed
      stepDescription: currentStep,
      planStatus: 'in_progress'
    };
  } else if (objective.plan.status === 'approved' && currentStepIndex >= objective.plan.steps.length) {
    // All steps are completed
    console.log(`Agent: All plan steps completed for objective ${objectiveId}.`);
    objective.plan.status = 'completed';
    dataStore.updateObjectiveById(objectiveId, objective.title, objective.brief, objective.plan, objective.chatHistory);

    return {
      message: 'All plan steps completed!',
      planStatus: 'completed'
    };
  }

  // If plan is 'completed' or any other state, and not executing a step, rely on Gemini for conversational response.
  console.log(`Agent: Plan status is '${objective.plan.status}'. No steps to execute, or execution finished. Calling Gemini service for conversational response.`);
  try {
    // projectAssets are already fetched above
    const response = await geminiService.fetchGeminiResponse(userInput, chatHistory, projectAssets);
    return response; // This will be a string for conversational turn
  } catch (error) {
    console.error('Agent: Error fetching response from Gemini service:', error);
    return "Agent: I'm sorry, I encountered an error trying to get a response.";
  }
}

// src/agent.js
/**
 * Initializes the agent for a given objective by generating a plan.
 * @param {string} objectiveId The ID of the objective to initialize.
 * @returns {Promise<Object>} A promise that resolves to the updated objective.
 * @throws {Error} If the objective is not found.
 */
async function initializeAgent(objectiveId) {
    const objective = dataStore.findObjectiveById(objectiveId);
    if (!objective) {
        throw new Error(`Objective with ID ${objectiveId} not found.`);
    }

    // Call the new service function to generate the plan
    const project = dataStore.findProjectById(objective.projectId);
    const projectAssets = project ? project.assets : [];
    const { planSteps, questions } = await geminiService.generatePlanForObjective(objective, projectAssets);

    // Update the objective's plan
    objective.plan.steps = planSteps;
    objective.plan.questions = questions;
    objective.plan.status = 'pending_approval'; // Or 'generated_pending_review'

    // Save the updated objective
    // Ensuring consistency with the 5-argument version used elsewhere.
    const updatedObjective = dataStore.updateObjectiveById(objectiveId, objective.title, objective.brief, objective.plan, objective.chatHistory);
    if (!updatedObjective) {
        // This case should ideally not be reached if findObjectiveById succeeded and dataStore is consistent
        throw new Error(`Failed to update objective with ID ${objectiveId}.`);
    }

    return updatedObjective;
}

module.exports = {
  getAgentResponse,
  initializeAgent, // Export the new function
};
