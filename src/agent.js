// Import services
const dataStore = require('./dataStore');
const geminiService = require('./services/geminiService');
const { getToolSchema } = require('./services/toolRegistryService');
const { getPrompt } = require('./services/promptProvider');
const toolExecutorService = require('./services/toolExecutorService'); // Import the new service

// --- Tool Execution Dispatcher ---
async function executeTool(toolName, toolArguments, projectId, objective) {
    console.log(`Agent: executeTool dispatcher for ${toolName}, args: `, toolArguments);
    switch (toolName) {
        case 'semantic_search_assets':
            const query = toolArguments && toolArguments.query ? toolArguments.query : "";
            return await toolExecutorService.perform_semantic_search_assets_tool(query, projectId);
        case 'create_image_asset':
            const imagePrompt = toolArguments && toolArguments.prompt ? toolArguments.prompt : "Unspecified image prompt";
            return await toolExecutorService.create_image_asset_tool(imagePrompt, projectId);
        case 'create_video_asset':
            const videoPrompt = toolArguments && toolArguments.prompt ? toolArguments.prompt : "Unspecified video prompt";
            return await toolExecutorService.create_video_asset_tool(videoPrompt, projectId);

        // Social Media Tools
        case 'facebook_managed_page_posts_search':
            return await toolExecutorService.execute_facebook_managed_page_posts_search(toolArguments, projectId);
        case 'facebook_public_posts_search':
            return await toolExecutorService.execute_facebook_public_posts_search(toolArguments, projectId);
        case 'tiktok_public_posts_search':
            return await toolExecutorService.execute_tiktok_public_posts_search(toolArguments, projectId);
        case 'facebook_create_post':
            return await toolExecutorService.execute_facebook_create_post(toolArguments, projectId);
        case 'tiktok_create_post':
            return await toolExecutorService.execute_tiktok_create_post(toolArguments, projectId);
        case 'browse_web':
            const url = toolArguments && toolArguments.url ? toolArguments.url : "";
            // Note: projectId is passed for consistency, though execute_browse_web_tool might not use it directly yet.
            return await toolExecutorService.execute_browse_web_tool(url, projectId);
        case 'post_to_linkedin': {
            const project = dataStore.findProjectById(projectId);
            if (!project || !project.linkedinAccessToken || !project.linkedinUserID) {
                return JSON.stringify({ error: "LinkedIn account not connected or credentials missing for this project." });
            }
            const params = {
                accessToken: project.linkedinAccessToken,
                userId: project.linkedinUserID, // This should be the URN format, e.g., "urn:li:person:USER_ID"
                content: toolArguments.content
            };
            return await toolExecutorService.execute_post_to_linkedin(params, projectId);
        }

        // Google Ads Scaffold Tools
        case 'google_ads_create_campaign_scaffold': {
            console.log("Agent: Initiating google_ads_create_campaign_scaffold...");
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";

            const geminiPromptForConfig = await getPrompt('agent/google_ads_campaign_config', {
                projectContext: projectContext,
                campaign_name_suggestion: toolArguments.campaign_name_suggestion,
                campaign_type_suggestion: toolArguments.campaign_type_suggestion
            });

            // Pass objective.chatHistory for context, projectAssets is empty for this type of call
            let campaignConfigOrClarification;
            try {
                campaignConfigOrClarification = await geminiService.fetchGeminiResponse(geminiPromptForConfig, objective.chatHistory, []);
            } catch (error) {
                console.error("Agent: Error fetching campaign config from Gemini:", error);
                return JSON.stringify({ error: "Failed to get campaign configuration details from AI: " + error.message });
            }

            if (typeof campaignConfigOrClarification === 'object' && campaignConfigOrClarification.tool_call) {
                 return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool while generating campaign config." });
            }
            if (typeof campaignConfigOrClarification !== 'string') {
                console.error("Agent: Unexpected response type from Gemini for campaign config. Expected string, got:", typeof campaignConfigOrClarification);
                return JSON.stringify({ error: "Received unexpected configuration format from AI." });
            }

            if (campaignConfigOrClarification.includes("BUDGET_NEEDED")) {
                objective.pendingToolBudgetInquiry = {
                    originalToolCall: { name: toolName, arguments: toolArguments, stepIndex: objective.plan.currentStepIndex }, // Store current step index
                    generatedConfig: campaignConfigOrClarification.replace("BUDGET_NEEDED", "").trim(),
                    projectId: projectId,
                    objectiveId: objective.id
                };
                return {
                    askUserInput: true,
                    message: await getPrompt('agent/budget_inquiry'),
                };
            }

            // This is the path if BUDGET_NEEDED was NOT in the response from Gemini
            console.log("Agent: Gemini generated campaign config (no immediate budget request from Gemini):", campaignConfigOrClarification);
            let parsedCampaignConfig;
            try {
                parsedCampaignConfig = JSON.parse(campaignConfigOrClarification);
            } catch (e) {
                console.error("Agent: Failed to parse campaign config from Gemini:", e);
                return JSON.stringify({ error: "Failed to understand campaign configuration from AI." });
            }
            // Budget for this path is not from direct user input in this turn.
            // It's assumed to be part of parsedCampaignConfig or handled by Ads API defaults.
            const budgetForNonInteractivePath = parsedCampaignConfig.budgetInfo || "BUDGET_NOT_INTERACTIVELY_SET_IN_THIS_STEP";

            const toolApiResult = await toolExecutorService.execute_google_ads_create_campaign_from_config(
                parsedCampaignConfig,
                budgetForNonInteractivePath,
                projectId
            );
            return toolApiResult; // This is the JSON string from the (mocked) Ads API call
        }
        case 'google_ads_create_ad_group_scaffold': {
            console.log("Agent: Initiating google_ads_create_ad_group_scaffold...");
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";
            const campaignId = toolArguments.campaign_id;

            const geminiPromptForAdGroupConfig = await getPrompt('agent/google_ads_adgroup_config', {
                projectContext: projectContext,
                campaignId: campaignId,
                ad_group_name_suggestion: toolArguments.ad_group_name_suggestion
            });

            let adGroupConfigString;
            try {
                adGroupConfigString = await geminiService.fetchGeminiResponse(geminiPromptForAdGroupConfig, objective.chatHistory, []);
            } catch (error) {
                console.error("Agent: Error fetching ad group config from Gemini:", error);
                return JSON.stringify({ error: "Failed to get ad group configuration details from AI: " + error.message });
            }

            if (typeof adGroupConfigString === 'object' && adGroupConfigString.tool_call) {
                 return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool while generating ad group config." });
            }
            if (typeof adGroupConfigString !== 'string') {
                console.error("Agent: Unexpected response type from Gemini for ad group config. Expected string, got:", typeof adGroupConfigString);
                return JSON.stringify({ error: "Received unexpected ad group configuration format from AI." });
            }

            let parsedAdGroupConfig;
            try {
                parsedAdGroupConfig = JSON.parse(adGroupConfigString);
            } catch (e) {
                console.error("Agent: Failed to parse ad group config from Gemini:", e);
                return JSON.stringify({ error: "Failed to understand ad group configuration from AI." });
            }
            return await toolExecutorService.execute_google_ads_create_ad_group_from_config(parsedAdGroupConfig, projectId);
        }
        case 'google_ads_create_ad_scaffold': {
            console.log("Agent: Initiating google_ads_create_ad_scaffold...");
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";
            const adGroupId = toolArguments.ad_group_id;

            const geminiPromptForAdConfig = await getPrompt('agent/google_ads_ad_config', {
                projectContext: projectContext,
                adGroupId: adGroupId,
                ad_type_suggestion: toolArguments.ad_type_suggestion
            });

            let adConfigString;
            try {
                adConfigString = await geminiService.fetchGeminiResponse(geminiPromptForAdConfig, objective.chatHistory, []);
            } catch (error) {
                console.error("Agent: Error fetching ad config from Gemini:", error);
                return JSON.stringify({ error: "Failed to get ad configuration details from AI: " + error.message });
            }

            if (typeof adConfigString === 'object' && adConfigString.tool_call) {
                 return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool while generating ad config." });
            }
            if (typeof adConfigString !== 'string') {
                console.error("Agent: Unexpected response type from Gemini for ad config. Expected string, got:", typeof adConfigString);
                return JSON.stringify({ error: "Received unexpected ad configuration format from AI." });
            }
            let parsedAdConfig;
            try {
                parsedAdConfig = JSON.parse(adConfigString);
            } catch (e) {
                console.error("Agent: Failed to parse ad config from Gemini:", e);
                return JSON.stringify({ error: "Failed to understand ad configuration from AI." });
            }
            return await toolExecutorService.execute_google_ads_create_ad_from_config(parsedAdConfig, projectId);
        }
        case 'execute_dynamic_asset_script':
            return await toolExecutorService.execute_dynamic_asset_script(toolCall.arguments, objective.projectId);
        default:
            console.error(`Agent: Unknown tool name in executeTool dispatcher: ${toolName}`);
            return JSON.stringify({ error: `Tool '${toolName}' is not recognized by the executeTool dispatcher.` });
    }
}

/**
 * Gets the agent's response.
 * This function will take user input and chat history,
 * then call the Gemini service to get a response.
 *
 * @param {string} userInput The user's latest message.
 * @param {Array<Object>} chatHistory The entire chat history.
 * @param {string} objectiveId The ID of the current objective.
 * @returns {Promise<string|Object>} A promise that resolves to the agent's response, which can be a string or an object if asking for user input.
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

  // Check for pending budget inquiry
  if (objective.pendingToolBudgetInquiry && objective.pendingToolBudgetInquiry.projectId === objective.projectId && objective.pendingToolBudgetInquiry.objectiveId === objective.id) {
      const budget = userInput;
      const pendingInfo = objective.pendingToolBudgetInquiry;

      console.log(`Agent: Received budget "${budget}" for pending campaign: ${pendingInfo.originalToolCall.name}.`);

      // Validate budget format
      const isValidBudget = (budgetInput) => {
        if (typeof budgetInput !== 'string' && typeof budgetInput !== 'number') {
            return false;
        }
        const cleanedBudget = String(budgetInput).replace(/[\s$,€£¥]/g, ''); // Remove currency symbols and whitespace
        const number = parseFloat(cleanedBudget);
        return !isNaN(number) && number > 0;
      };

      if (!isValidBudget(budget)) {
        const errorMessage = "Invalid budget format. Please provide a valid positive number (e.g., 100 or $100.50).";
        objective.chatHistory.push({ speaker: 'user', content: budget }); // Log user's attempt
        objective.chatHistory.push({ speaker: 'agent', content: errorMessage });
        objective.pendingToolBudgetInquiry = null; // Clear pending state

        // Advance step to avoid loop, using the original step index from when the inquiry was made
        objective.plan.currentStepIndex = (pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex) + 1;
        objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';

        // Use dataStore consistently
        dataStore.updateObjectiveById(objectiveId, objective);

        return {
            message: errorMessage,
            currentStep: objective.plan.currentStepIndex -1, // step just attempted (now advanced)
            stepDescription: objective.plan.steps[objective.plan.currentStepIndex -1], // description of step just attempted
            planStatus: objective.plan.status
        };
      }
      // If valid, proceed with existing logic.

      objective.chatHistory.push({ speaker: 'user', content: budget }); // Log valid user input
      // Updated confirmation message to reflect successful validation before proceeding
      objective.chatHistory.push({ speaker: 'agent', content: `Budget of ${budget} accepted. Now creating the campaign...` });

      let parsedCampaignConfigFromPending;
      try {
          parsedCampaignConfigFromPending = JSON.parse(pendingInfo.generatedConfig);
      } catch (e) {
          console.error("Agent: Failed to parse stored campaign config from pendingToolBudgetInquiry:", e);
          objective.chatHistory.push({ speaker: 'agent', content: "I encountered an issue with the campaign details I had prepared. Please try initiating the campaign creation again." });
          objective.pendingToolBudgetInquiry = null;
          // Advance step even on error to avoid loop, or have a specific error state
          objective.plan.currentStepIndex = (pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex) + 1;
          objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
          dataStore.updateObjectiveById(objectiveId, objective);
          return {
              message: "Error: Could not retrieve the saved campaign details to proceed with budget. Please try creating the campaign again.",
              currentStep: objective.plan.currentStepIndex -1,
              stepDescription: objective.plan.steps[objective.plan.currentStepIndex -1],
              planStatus: objective.plan.status
          };
      }

      // Call the actual executor function from toolExecutorService
      const toolApiResult = await toolExecutorService.execute_google_ads_create_campaign_from_config(
          parsedCampaignConfigFromPending,
          budget, // User provided budget
          pendingInfo.projectId
      );

      // Now, take toolApiResult and get a final summary from Gemini.
      const originalStepDescription = objective.plan.steps[pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex];
      const contextForGeminiSummary = await getPrompt('agent/budget_submission_summary', {
          toolApiResult: toolApiResult,
          originalStepDescription: originalStepDescription
      });

            let finalMessageForStep;
            try {
                finalMessageForStep = await geminiService.fetchGeminiResponse(contextForGeminiSummary, objective.chatHistory, []);
                if (typeof finalMessageForStep !== 'string') {
                    console.error("Agent: Budget summary response from Gemini was not a string:", finalMessageForStep);
                    finalMessageForStep = "Campaign creation initiated. Received an unexpected internal confirmation format.";
                }
            } catch (error) {
                console.error("Agent: Error fetching summary from Gemini after budget submission:", error);
                finalMessageForStep = `Campaign creation initiated. Error getting AI summary: ${error.message}. Tool output was: ${toolApiResult}`;
            }
      objective.chatHistory.push({ speaker: 'agent', content: finalMessageForStep });
      objective.pendingToolBudgetInquiry = null; // Clear pending state
      // The step is now considered complete, advance plan
      objective.plan.currentStepIndex = (pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex) + 1;
      objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
      dataStore.updateObjectiveById(objectiveId, objective);


      return {
          message: finalMessageForStep,
          currentStep: objective.plan.currentStepIndex - 1,
          stepDescription: objective.plan.steps[objective.plan.currentStepIndex - 1],
          planStatus: objective.plan.status
      };
  }

  // Block execution if plan is in a state that requires user attention or is an error state,
  // before attempting to execute steps or provide conversational fallback for 'completed' plans.
  const attentionNeededStatuses = ['pending_approval', 'error_generating_plan', undefined, null];
  if (!objective.plan || attentionNeededStatuses.includes(objective.plan.status)) {
    let message = "It looks like there's a plan that needs your attention. ";
    if (!objective.plan || !objective.plan.status) { // Covers undefined or null status
        message += "A plan has not been initialized yet. Please try selecting the objective again, which may trigger initialization.";
    } else if (objective.plan.status === 'pending_approval') {
        message += "Please approve the current plan before we proceed with this objective.";
    } else if (objective.plan.status === 'error_generating_plan') {
        message += "There was an error generating the plan. Please try re-initializing or check for issues.";
    } else { // Should not be hit if logic is correct, but as a fallback
        message += `The current plan status is '${objective.plan.status}'. Please review.`;
    }
    console.log(`Agent: Plan needs attention for objective ${objectiveId}. Status: ${objective.plan ? objective.plan.status : 'N/A'}`);
    return message;
  }
  // At this point, plan status can be 'approved', 'in_progress', 'completed', or 'pending_scheduling'.

  // Plan is approved, commence execution or continue conversation
  console.log(`Agent: Plan approved for objective ${objectiveId}.`);

  // Fetch project assets early as they might be needed for step execution or conversational fallback
  const project = dataStore.findProjectById(objective.projectId);
  const projectAssets = project ? project.assets : [];

  // --- Plan Refresh for Recurring Tasks Activated by Scheduler ---
  if (objective.isRecurring &&
      objective.plan.status === 'approved' && // Scheduler sets it to 'approved'
      objective.plan.currentStepIndex === 0 && // Indicates it's the start of a new/refreshed run
      objective.originalPlan && // Ensure there's a template
      objective.currentRecurrenceContext // Ensure there's context to use for regeneration
     ) {
    console.log(`Agent: Recurring objective ${objectiveId} instance starting. Refreshing plan with context.`);
    try {
        // Regenerate the plan using the currentRecurrenceContext
        const { planSteps, questions } = await geminiService.generatePlanForObjective(objective, projectAssets);

        // Update the active plan with these new context-aware steps/questions
        objective.plan.steps = planSteps;
        objective.plan.questions = questions;
        // Status remains 'approved', currentStepIndex remains 0.
        // No need to update originalPlan here, that's the template.

        dataStore.updateObjective(objective); // Save the refreshed plan
        console.log(`Agent: Plan for recurring objective ${objectiveId} refreshed with new context.`);
    } catch (error) {
        console.error(`Agent: Error refreshing plan for recurring objective ${objectiveId}:`, error);
        // Return an error message or handle appropriately.
        // For now, let it proceed with the plan copied from originalPlan by the scheduler/previous logic,
        // or return an error if plan refresh is critical.
        return `Agent: Error refreshing plan for recurring task: ${error.message}`;
    }
  }
  // --- End Plan Refresh ---


  // Execute next step if plan is in progress
  let currentStepIndex = objective.plan.currentStepIndex === undefined ? 0 : objective.plan.currentStepIndex;

  if (currentStepIndex < objective.plan.steps.length) {
    const currentStep = objective.plan.steps[currentStepIndex];
    console.log(`Agent: Executing step ${currentStepIndex + 1}: "${currentStep}" for objective ${objectiveId}`);

    // Call the service function to execute the step (might return text or tool_call)
    let stepExecutionResult;
    try {
        stepExecutionResult = await geminiService.executePlanStep(currentStep, objective.chatHistory, projectAssets);
    } catch (error) {
        console.error(`Agent: Error executing plan step "${currentStep}":`, error);
        finalMessageForStep = `Error processing step "${currentStep}": ${error.message}`;
        objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
        // No tool_call if executePlanStep itself failed, so directly update plan and return
        objective.plan.currentStepIndex = currentStepIndex + 1;
        objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
        dataStore.updateObjectiveById(objectiveId, objective);
        return {
            message: finalMessageForStep,
            currentStep: currentStepIndex,
            stepDescription: currentStep,
            planStatus: objective.plan.status
        };
    }

    let finalMessageForStep;

    if (stepExecutionResult && typeof stepExecutionResult === 'object' && stepExecutionResult.tool_call) {
        const toolCall = stepExecutionResult.tool_call;
        console.log(`Agent: Gemini requested tool call: ${toolCall.name}`, toolCall.arguments);

        const toolSchema = getToolSchema(toolCall.name);
        if (!toolSchema) {
            console.error(`Agent: Unknown tool requested: ${toolCall.name}`);
            finalMessageForStep = `Error: The agent tried to use an unknown tool: ${toolCall.name}.`;
            // Update chat history with this error
            objective.chatHistory.push({ speaker: 'system', content: `Error: Tool ${toolCall.name} not found.` });
        } else {
            let validationErrors = [];
            if (toolSchema.parameters && toolSchema.parameters.properties) {
                const schemaParams = toolSchema.parameters.properties;
                const requiredParams = toolSchema.parameters.required || [];

                // Check required params
                for (const reqParam of requiredParams) {
                    if (toolCall.arguments[reqParam] === undefined) {
                        validationErrors.push(`Missing required argument '${reqParam}'.`);
                    }
                }

                // Check types and enums for provided arguments
                for (const argName in toolCall.arguments) {
                    if (schemaParams[argName]) {
                        const schemaParam = schemaParams[argName];
                        const argValue = toolCall.arguments[argName];
                        const expectedType = schemaParam.type;
                        let actualType = typeof argValue;

                        // More precise type checking
                        if (expectedType === 'array') {
                            if (!Array.isArray(argValue)) {
                                validationErrors.push(`Argument '${argName}' must be an array, but got ${actualType}.`);
                            }
                        } else if (expectedType === 'object') {
                            if (actualType !== 'object' || argValue === null || Array.isArray(argValue)) {
                                validationErrors.push(`Argument '${argName}' must be an object, but got ${argValue === null ? 'null' : (Array.isArray(argValue) ? 'array' : actualType)}.`);
                            }
                        } else if (actualType !== expectedType) {
                            // This check is for primitive types like string, number, boolean
                             if (expectedType === 'number' && isNaN(argValue)){ // specifically check if it's NaN for type number
                                validationErrors.push(`Argument '${argName}' must be a valid number, but got NaN.`);
                             } else if (expectedType !== 'array' && expectedType !== 'object' && actualType !== expectedType) { // re-check to avoid duplicating array/object messages
                                validationErrors.push(`Argument '${argName}' must be a ${expectedType}, but got ${actualType}.`);
                            }
                        }

                        // Enum checking
                        if (schemaParam.enum && Array.isArray(schemaParam.enum) && !schemaParam.enum.includes(argValue)) {
                            validationErrors.push(`Argument '${argName}' must be one of [${schemaParam.enum.join(', ')}], but got '${argValue}'.`);
                        }
                    } else {
                        // Optional: Warn about extraneous arguments not in schema. For now, we allow them as they might be handled by the tool itself.
                        // validationErrors.push(`Unexpected argument '${argName}' not defined in tool schema.`);
                    }
                }
            }

            if (validationErrors.length > 0) {
                finalMessageForStep = `Tool argument validation failed for '${toolCall.name}': ${validationErrors.join(' ')}`;
                objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
                // Skip executeTool and proceed to update objective state and return.
                // The existing logic after this 'else' block (or outside the 'if (toolCall)' block)
                // already handles finalMessageForStep for chat history and plan updates.
            } else {
                // Proceed with executeTool call (existing logic)
                const toolOutput = await executeTool(toolCall.name, toolCall.arguments, objective.projectId, objective); // Objective is in scope
                console.log(`Agent: Tool ${toolCall.name} executed. Output:`, toolOutput);

                // If executeTool returns an object with askUserInput, handle it
                if (toolOutput && toolOutput.askUserInput) {
                    // The objective (with pendingToolBudgetInquiry) would have been set inside executeTool
                    // Add agent's question to chat history
                    objective.chatHistory.push({ speaker: 'agent', content: toolOutput.message });
                    // Save objective with pendingToolBudgetInquiry and new chat history
                    dataStore.updateObjectiveById(objectiveId, objective);
                    return toolOutput; // Return the { askUserInput, message } object directly
                }

                // Add tool call and tool output to chat history for context
                // This simple string representation can be improved with structured messages later.
                objective.chatHistory.push({
                    speaker: 'system', // Or 'tool_executor'
                    content: `Called tool ${toolCall.name} with arguments ${JSON.stringify(toolCall.arguments)}. Output: ${toolOutput}`
                });

                // Send tool output back to Gemini for summarization/final response for the step
                const contextForGemini = await getPrompt('agent/tool_output_summary', {
                    toolName: toolCall.name,
                    toolArguments: JSON.stringify(toolCall.arguments),
                    toolOutput: toolOutput,
                    currentStep: currentStep
                });

                let geminiResponseAfterTool;
                try {
                    geminiResponseAfterTool = await geminiService.fetchGeminiResponse(contextForGemini, objective.chatHistory, projectAssets);
                } catch (error) {
                    console.error("Agent: Error fetching summary from Gemini after tool call:", error);
                    finalMessageForStep = `Error getting summary after tool execution: ${error.message}. Tool output was: ${toolOutput}`;
                    objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
                    // Proceed to next step despite summarization error
                    objective.plan.currentStepIndex = currentStepIndex + 1;
                    objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
                    dataStore.updateObjectiveById(objectiveId, objective);
                    dataStore.updateObjective(objective);
                    return {
                        message: finalMessageForStep,
                        currentStep: currentStepIndex,
                        stepDescription: currentStep,
                        planStatus: objective.plan.status
                    };
                }

                if (typeof geminiResponseAfterTool === 'object' && geminiResponseAfterTool.tool_call) {
                    console.error("Agent: Gemini requested another tool call immediately after a tool execution. This is not yet supported in this flow.");
                    finalMessageForStep = "Error: Agent tried to chain tool calls in a way that's not yet supported.";
                    objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
                } else if (typeof geminiResponseAfterTool === 'string') {
                    finalMessageForStep = geminiResponseAfterTool;
                    // Add Gemini's summary to chat history as the agent's response for the step
                    objective.chatHistory.push({ speaker: 'agent', content: finalMessageForStep });
                } else {
                     console.error("Agent: Unexpected response type from Gemini after tool execution:", geminiResponseAfterTool);
                     finalMessageForStep = "Error: Agent received an unexpected internal response after tool execution.";
                     objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
                }
            } // This closes the 'else' for validationErrors.length > 0
        }
    } else if (typeof stepExecutionResult === 'string') {
        // Gemini provided a direct response for the step, no tool call needed.
        finalMessageForStep = stepExecutionResult;
        // Add Gemini's direct response to chat history
        objective.chatHistory.push({ speaker: 'agent', content: finalMessageForStep });
    } else {
        console.error("Agent: Unexpected response type from executePlanStep:", stepExecutionResult);
        finalMessageForStep = "Error: Agent received an unexpected internal response while processing the step.";
        objective.chatHistory.push({ speaker: 'system', content: finalMessageForStep });
    }

    // Update objective's plan and chat history in dataStore
    objective.plan.currentStepIndex = currentStepIndex + 1; // Increment step index
    objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress'; // Update status if all steps done

    dataStore.updateObjectiveById(objectiveId, objective);
    // Ensure the full objective is updated in the data store
    dataStore.updateObjective(objective);


    if (objective.plan.status === 'completed' && objective.plan.currentStepIndex >= objective.plan.steps.length) {
        console.log(`Agent: Plan instance completed for objective ${objectiveId}.`);

        // --- Recurrence Logic ---
        if (objective.isRecurring && objective.recurrenceRule && objective.originalPlan) {
            let scheduleNext = true;
            const now = new Date();
            let nextRunTime = null;

            if (objective.recurrenceRule.endTime) {
                const endTime = new Date(objective.recurrenceRule.endTime);
                if (now >= endTime) {
                    scheduleNext = false;
                    console.log(`Agent: Recurrence ended for objective ${objectiveId} as endTime has passed.`);
                }
            }

            if (scheduleNext) {
                // Calculate nextRunTime (simple version)
                const rule = objective.recurrenceRule;
                nextRunTime = new Date(now); // Start from now

                if (rule.frequency === 'daily') {
                    nextRunTime.setDate(now.getDate() + (rule.interval || 1));
                } else if (rule.frequency === 'weekly') {
                    const currentDay = now.getDay(); // 0 (Sun) - 6 (Sat)
                    let targetDay;
                    // Simple dayOfWeek matching, assumes rule.dayOfWeek is lowercase 'monday', 'tuesday' etc.
                    // More robust parsing would be needed for real-world scenarios.
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    targetDay = days.indexOf(rule.dayOfWeek ? rule.dayOfWeek.toLowerCase() : days[now.getDay()]); // Default to same day next week if not specified

                    if (targetDay === -1) targetDay = now.getDay(); // Fallback if dayOfWeek is invalid

                    let daysUntilTarget = targetDay - currentDay;
                    if (daysUntilTarget <= 0 && (rule.interval || 1) === 1 && rule.frequency === 'weekly') { // ensure it's in the future for simple weekly
                        daysUntilTarget += 7;
                    }
                    nextRunTime.setDate(now.getDate() + daysUntilTarget + (7 * ((rule.interval || 1) -1)) );

                } else {
                    console.log(`Agent: Unsupported recurrence frequency: ${rule.frequency}. Objective ${objectiveId} will not recur.`);
                    scheduleNext = false;
                }

                // Basic time setting (e.g., keep the same time of day)
                // For more complex scenarios, time settings from recurrenceRule would be used.
                // nextRunTime.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);


                if (objective.recurrenceRule.endTime && nextRunTime > new Date(objective.recurrenceRule.endTime)) {
                    scheduleNext = false;
                    console.log(`Agent: Next calculated run time for objective ${objectiveId} is after endTime. Recurrence stopped.`);
                }
            }

            if (scheduleNext && nextRunTime) {
                objective.nextRunTime = nextRunTime;
                objective.plan = {
                    steps: JSON.parse(JSON.stringify(objective.originalPlan.steps)),
                    questions: JSON.parse(JSON.stringify(objective.originalPlan.questions)),
                    status: 'pending_scheduling', // New status
                    currentStepIndex: 0,
                };
                objective.currentRecurrenceContext = {
                    previousPostSummary: finalMessageForStep, // Store summary from the completed instance
                    lastCompletionTime: new Date().toISOString(),
                };
                console.log(`Agent: Objective ${objectiveId} rescheduled. Next run: ${objective.nextRunTime}. Plan reset.`);
            } else {
                // No next run, so it's truly completed.
                objective.nextRunTime = null; // Clear any previous nextRunTime
                // objective.plan.status remains 'completed'
                console.log(`Agent: Objective ${objectiveId} recurrence finished or not scheduled.`);
            }
        } else {
             console.log(`Agent: Objective ${objectiveId} is not recurring or has no original plan. Final completion.`);
             objective.plan.status = 'completed'; // Ensure it's marked completed
        }
        // --- End Recurrence Logic ---

        // Update objective in dataStore after recurrence handling
        dataStore.updateObjective(objective);

        return {
            message: finalMessageForStep ? 'Plan instance completed! Last step result: ' + finalMessageForStep : 'Plan instance completed!',
            currentStep: currentStepIndex,
            stepDescription: currentStep,
            planStatus: objective.plan.status, // This will be 'pending_scheduling' or 'completed'
            nextRunTime: objective.nextRunTime // Include nextRunTime in the response
        };
    }

    return {
      message: finalMessageForStep,
      currentStep: currentStepIndex, // Index of the step just processed
      stepDescription: currentStep,
      planStatus: 'in_progress'
    };
  } else if (objective.plan.status === 'completed' || (objective.plan.status === 'approved' && currentStepIndex >= objective.plan.steps.length)) {
    // This case handles when the plan was already completed, or if it was 'approved' but had no steps / currentStepIndex was already at/past length.
    // If it just got completed by the block above, that return takes precedence.
    console.log(`Agent: Plan is already marked as completed or no more steps. Objective ID: ${objectiveId}.`);

    // --- Recurrence Check on already completed plans ---
    // This section might be redundant if the above block always catches completion and handles recurrence.
    // However, it's a safeguard. If a plan is loaded as 'completed', this could re-trigger recurrence if applicable.
    // For now, let's assume the main recurrence logic is within the "just completed" block.
    // If an objective is loaded and its status is 'completed', but it has a nextRunTime in the past,
    // the scheduler (external to this function) should pick it up.
    // This function primarily reacts to a plan *instance* just finishing.

    if (objective.isRecurring && objective.nextRunTime && new Date(objective.nextRunTime) <= new Date()) {
        // This implies a scheduled run was missed or is due.
        // The scheduler should handle this. For getAgentResponse, if plan is 'completed'
        // and has a nextRunTime, it means it's waiting for that time.
        console.log(`Agent: Objective ${objectiveId} is completed and has a future nextRunTime: ${objective.nextRunTime}. Waiting for scheduler.`);
        // We might want to change status to 'pending_scheduling' if it's not already.
        if(objective.plan.status !== 'pending_scheduling'){
            // This situation should ideally be handled by scheduler logic primarily.
            // For example, if a user tries to interact with an objective that completed and is now pending_scheduling.
        }
    }
    // --- End Recurrence Check ---

    objective.plan.status = 'completed'; // Ensure status is 'completed' if no recurrence logic changes it
    dataStore.updateObjective(objective); // Update the objective

    return {
      message: 'All plan steps completed!', // General message for this state
      planStatus: 'completed',
      nextRunTime: objective.nextRunTime // Include nextRunTime
    };
  }

  // Fallback for conversational response if plan isn't actively being executed by the logic above.
  // This also covers cases where plan status might be 'approved' but currentStepIndex is out of bounds initially.
  console.log(`Agent: Plan status is '${objective.plan.status}', or step execution block not entered. Proceeding with conversational response.`);
  try {
    // projectAssets are already fetched above
    const geminiResponse = await geminiService.fetchGeminiResponse(userInput, chatHistory, projectAssets);
    if (typeof geminiResponse !== 'string') {
        console.error("Agent: Conversational fallback from Gemini was not a string:", geminiResponse);
        // It's possible Gemini tried a tool_call based on conversational input.
        // For a simple conversational turn, we might not want to process the tool_call here
        // or we might want to inform the user that an unexpected action was attempted.
        if (typeof geminiResponse === 'object' && geminiResponse.tool_call) {
             return "Agent: I tried to perform an action based on our conversation, but it seems I got a bit ahead of myself. Could you please rephrase or clarify your request?";
        }
        return "Agent: I received an unexpected type of response. Please try again.";
    }
    return geminiResponse;
  } catch (error) {
    console.error('Agent: Error fetching response from Gemini service:', error);
    return "Agent: I'm sorry, I encountered an error trying to get a response: " + error.message;
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
    let planData;
    try {
        planData = await geminiService.generatePlanForObjective(objective, projectAssets);
    // console.log('Debug: planData from geminiService:', JSON.stringify(planData));
    } catch (error) {
        console.error(`Agent: Error generating plan for objective ${objectiveId}:`, error);
        objective.plan.status = 'error_generating_plan';
        objective.plan.steps = [];
        objective.plan.questions = [`Failed to generate plan: ${error.message}`];
        dataStore.updateObjective(objective);
        throw new Error(`Failed to generate plan: ${error.message}`); // Re-throw to inform caller
    }
    const { planSteps, questions } = planData;
    // console.log('Debug: planSteps:', JSON.stringify(planSteps), 'questions:', JSON.stringify(questions));

    // Update the objective's plan
    // Ensure objective.plan.steps and objective.plan.questions are arrays
    objective.plan.steps = Array.isArray(planSteps) ? planSteps : [];
    objective.plan.questions = Array.isArray(questions) ? questions : [];
    objective.plan.status = 'pending_approval'; // Or 'generated_pending_review'

    // Handle recurring objectives: store the original plan
    if (objective.isRecurring) {
        objective.originalPlan = {
            steps: JSON.parse(JSON.stringify(planSteps)), // Deep copy
            questions: JSON.parse(JSON.stringify(questions)), // Deep copy
            // currentStepIndex will be reset to 0 when a new recurrence starts
        };
        console.log(`Agent: Stored original plan for recurring objective ${objectiveId}.`);
    }

    // Save the updated objective
    // Ensuring consistency with the 5-argument version used elsewhere.
    // Note: objective.originalPlan is now also part of the objective being saved if it's recurring
    const updatedObjective = dataStore.updateObjectiveById(objectiveId, objective);

    if (!updatedObjective) {
        // This case should ideally not be reached if findObjectiveById succeeded and dataStore is consistent
        throw new Error(`Failed to update objective with ID ${objectiveId}.`);
    }

    return objective; // Return the modified objective, which now includes originalPlan
}

module.exports = {
  getAgentResponse,
  initializeAgent, // Export the new function
};
