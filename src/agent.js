// Import services
const crypto = require('crypto');
const dataStore = require('./dataStore');
const geminiService = require('./services/geminiService');
const { getToolSchema } = require('./services/toolRegistryService');
const { getPrompt } = require('./services/promptProvider');
const toolExecutorService = require('./services/toolExecutorService');

// Helper to generate unique IDs
function generateInteractionId() {
    return `interaction_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

// --- Tool Execution Dispatcher (remains largely the same internally) ---
async function executeTool(toolName, toolArguments, projectId, objective) {
    console.log(`Agent: executeTool dispatcher for ${toolName}, args: `, toolArguments);
    // ... (existing switch cases for tools)
    // For brevity, the existing switch case content is omitted here but assumed to be the same.
    // It's important that this function still returns the raw toolOutput or an object with askUserInput.
    // The BUDGET_NEEDED logic inside 'google_ads_create_campaign_scaffold' will need careful handling
    // in the new flow if it's considered a separate user input request after tool approval.

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
            return await toolExecutorService.execute_browse_web_tool(url, projectId);
        case 'post_to_linkedin': {
            const project = dataStore.findProjectById(projectId);
            if (!project || !project.linkedinAccessToken || !project.linkedinUserID) {
                return JSON.stringify({ error: "LinkedIn account not connected or credentials missing for this project." });
            }
            const params = {
                accessToken: project.linkedinAccessToken,
                userId: project.linkedinUserID,
                content: toolArguments.content
            };
            return await toolExecutorService.execute_post_to_linkedin(params, projectId);
        }
        case 'google_ads_create_campaign_scaffold': {
            console.log("Agent: Initiating google_ads_create_campaign_scaffold...");
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";
            const geminiPromptForConfig = await getPrompt('agent/google_ads_campaign_config', {
                projectContext: projectContext,
                campaign_name_suggestion: toolArguments.campaign_name_suggestion,
                campaign_type_suggestion: toolArguments.campaign_type_suggestion
            });
            let campaignConfigOrClarification = await geminiService.fetchGeminiResponse(geminiPromptForConfig, objective.chatHistory, []);
            if (typeof campaignConfigOrClarification === 'object' && campaignConfigOrClarification.tool_call) {
                 return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool while generating campaign config." });
            }
            if (typeof campaignConfigOrClarification !== 'string') {
                return JSON.stringify({ error: "Received unexpected configuration format from AI." });
            }
            if (campaignConfigOrClarification.includes("BUDGET_NEEDED")) {
                objective.pendingToolBudgetInquiry = { // This state is now managed slightly differently
                    originalToolCall: { name: toolName, arguments: toolArguments, stepIndex: objective.plan.currentStepIndex },
                    generatedConfig: campaignConfigOrClarification.replace("BUDGET_NEEDED", "").trim(),
                    projectId: projectId,
                    objectiveId: objective.id
                };
                // This return needs to be handled by the calling function (handleToolApprovalResponse or getAgentResponse)
                // to set agent state to 'awaiting_user_input' for budget.
                return {
                    askUserInput: true, // This signals a specific type of user input is needed
                    message: await getPrompt('agent/budget_inquiry'),
                    forBudgetInquiry: true // Add a flag to differentiate
                };
            }
            let parsedCampaignConfig = JSON.parse(campaignConfigOrClarification);
            const budgetForNonInteractivePath = parsedCampaignConfig.budgetInfo || "BUDGET_NOT_INTERACTIVELY_SET_IN_THIS_STEP";
            return await toolExecutorService.execute_google_ads_create_campaign_from_config(parsedCampaignConfig, budgetForNonInteractivePath, projectId);
        }
        case 'google_ads_create_ad_group_scaffold': {
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";
            const geminiPromptForAdGroupConfig = await getPrompt('agent/google_ads_adgroup_config', {
                projectContext: projectContext,
                campaignId: toolArguments.campaign_id,
                ad_group_name_suggestion: toolArguments.ad_group_name_suggestion
            });
            let adGroupConfigString = await geminiService.fetchGeminiResponse(geminiPromptForAdGroupConfig, objective.chatHistory, []);
            if (typeof adGroupConfigString === 'object' && adGroupConfigString.tool_call) {
                 return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool." });
            }
            if (typeof adGroupConfigString !== 'string') {return JSON.stringify({ error: "Received unexpected ad group configuration format from AI." });}
            let parsedAdGroupConfig = JSON.parse(adGroupConfigString);
            return await toolExecutorService.execute_google_ads_create_ad_group_from_config(parsedAdGroupConfig, projectId);
        }
        case 'google_ads_create_ad_scaffold': {
            const project = dataStore.findProjectById(projectId);
            const projectContext = project ? project.description || project.name : "No project context available.";
            const geminiPromptForAdConfig = await getPrompt('agent/google_ads_ad_config', {
                projectContext: projectContext,
                adGroupId: toolArguments.ad_group_id,
                ad_type_suggestion: toolArguments.ad_type_suggestion
            });
            let adConfigString = await geminiService.fetchGeminiResponse(geminiPromptForAdConfig, objective.chatHistory, []);
            if (typeof adConfigString === 'object' && adConfigString.tool_call) {
                return JSON.stringify({ error: "Gemini unexpectedly tried to call another tool." });
            }
            if (typeof adConfigString !== 'string') {return JSON.stringify({ error: "Received unexpected ad configuration format from AI." });}
            let parsedAdConfig = JSON.parse(adConfigString);
            return await toolExecutorService.execute_google_ads_create_ad_from_config(parsedAdConfig, projectId);
        }
        // Ensure 'execute_dynamic_asset_script' is present, assuming toolCall is defined in its calling scope
        // This was referenced as toolCall.arguments, but toolCall is not defined in this function's scope.
        // Assuming it should be toolArguments.
        case 'execute_dynamic_asset_script':
            // The original code had `toolCall.arguments` which is not in scope. Assuming `toolArguments`.
            return await toolExecutorService.execute_dynamic_asset_script(toolArguments, projectId); // Changed objective.projectId to projectId
        default:
            console.error(`Agent: Unknown tool name in executeTool dispatcher: ${toolName}`);
            return JSON.stringify({ error: `Tool '${toolName}' is not recognized by the executeTool dispatcher.` });
    }
}


/**
 * Main function to get the agent's response or next set of actions.
 * @param {string} userInput The user's latest message, or a system trigger.
 * @param {string} objectiveId The ID of the current objective.
 * @returns {Promise<Object>} Structured response: { httpResponse, webSocketMessages, nextAgentState }
 */
async function getAgentResponse(userInput, objectiveId) {
    console.log(`Agent (getAgentResponse): UserInput: "${userInput}", ObjectiveID: ${objectiveId}`);
    const objective = dataStore.findObjectiveById(objectiveId);
    const webSocketMessages = [];
    let httpResponse = {};
    let nextAgentState = objective.currentAgentState || 'idle';

    if (!objective) {
        console.error(`Agent: Objective ${objectiveId} not found.`);
        return {
            httpResponse: { message: "Agent: Objective not found.", error: true },
            webSocketMessages: [],
            nextAgentState: 'error'
        };
    }

    // Initialize currentAgentState if not present
    if (!objective.currentAgentState) {
        objective.currentAgentState = 'idle';
    }

    // Add user input to chat history (if not a system trigger)
    if (!userInput.startsWith('_SYSTEM_')) {
        objective.chatHistory.push({ speaker: 'user', content: userInput });
    }

    // Handle pending budget inquiry specifically if that's the current state
    if (objective.currentAgentState === 'awaiting_budget_input' && objective.pendingToolBudgetInquiry) {
        // This flow is now part of handleBudgetInquiryResponse, called from server.js
        // For now, let's assume server.js routes budget responses to a dedicated handler.
        // If getAgentResponse is called directly with budget, it means direct user input after agent asked.
        return await handleBudgetInquiryResponse(objectiveId, userInput);
    }

    // If awaiting tool approval, and this userInput is not a system trigger, inform user.
    if (objective.currentAgentState === 'awaiting_tool_approval' && !userInput.startsWith('_SYSTEM_')) {
        const toolName = objective.pendingToolCall ? objective.pendingToolCall.name : "a tool";
        const message = `Please approve or deny the pending request to use ${toolName}.`;
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: message } });
        return {
            httpResponse: { message: message, askUserInput: false }, // No direct HTTP response needed if WS is primary
            webSocketMessages,
            nextAgentState: 'awaiting_tool_approval'
        };
    }


    // Plan status checks (pending_approval, error_generating_plan)
    const attentionNeededStatuses = ['pending_approval', 'error_generating_plan', undefined, null];
    if (!objective.plan || attentionNeededStatuses.includes(objective.plan.status)) {
        let message = "Plan requires attention: ";
        // ... (construct specific message based on plan status)
        if (!objective.plan || !objective.plan.status) { message += "Not initialized."; }
        else if (objective.plan.status === 'pending_approval') { message += "Needs approval."; }
        else if (objective.plan.status === 'error_generating_plan') { message += "Error in generation."; }
        else { message += `Status: ${objective.plan.status}`; }

        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: message } });
        return { httpResponse: { message }, webSocketMessages, nextAgentState: objective.currentAgentState || 'idle' };
    }


    // --- Plan Execution Logic ---
    let currentStepIndex = objective.plan.currentStepIndex === undefined ? 0 : objective.plan.currentStepIndex;

    if (objective.plan.status === 'approved' || objective.plan.status === 'in_progress') {
        if (userInput === '_SYSTEM_START_APPROVED_PLAN_' || userInput === '_SYSTEM_CONTINUE_AFTER_TOOL_' || objective.currentAgentState === 'processing') {
             // Ensure currentStepIndex is correctly initialized if starting
            if (userInput === '_SYSTEM_START_APPROVED_PLAN_') currentStepIndex = 0;
        } else if (objective.currentAgentState !== 'awaiting_tool_approval' && objective.currentAgentState !== 'awaiting_budget_input') {
            // This is a regular user message, not a system trigger to continue plan.
            // Agent should respond conversationally.
            const project = dataStore.findProjectById(objective.projectId);
            const projectAssets = project ? project.assets : [];
            try {
                const geminiResponse = await geminiService.fetchGeminiResponse(userInput, objective.chatHistory, projectAssets);
                if (typeof geminiResponse === 'string') {
                    webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: geminiResponse } });
                    objective.chatHistory.push({ speaker: 'agent', content: geminiResponse });
                    dataStore.updateObjectiveById(objectiveId, objective);
                    return { httpResponse: { message: geminiResponse }, webSocketMessages, nextAgentState: 'idle' };
                } else if (geminiResponse.tool_call) {
                    // If conversational input leads to a tool_call, switch to tool approval flow
                    // This part of logic will be handled below by the main step execution block if we fall through
                } else {
                     const errMsg = "Received unexpected conversational response format.";
                     webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errMsg, error: true } });
                     return { httpResponse: { message: errMsg, error: true }, webSocketMessages, nextAgentState: 'idle' };
                }
            } catch (error) {
                const errMsg = `Error in conversational fallback: ${error.message}`;
                webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errMsg, error: true } });
                return { httpResponse: { message: errMsg, error: true }, webSocketMessages, nextAgentState: 'error' };
            }
        }


        if (currentStepIndex < objective.plan.steps.length) {
            const currentStepDescription = objective.plan.steps[currentStepIndex];
            objective.currentAgentState = 'processing';
            dataStore.updateObjectiveById(objectiveId, objective); // Save state change

            webSocketMessages.push({
                type: 'progress_update',
                payload: { event: 'step_started', objectiveId, stepIndex: currentStepIndex, description: currentStepDescription }
            });
            objective.chatHistory.push({ speaker: 'system', content: `Executing step ${currentStepIndex + 1}: "${currentStepDescription}"` });


            let stepExecutionResult;
            try {
                const project = dataStore.findProjectById(objective.projectId);
                const projectAssets = project ? project.assets : [];
                const objectiveDetails = { title: objective.title, brief: objective.brief };
                stepExecutionResult = await geminiService.executePlanStep(currentStepDescription, objective.chatHistory, projectAssets, objectiveDetails);
            } catch (error) {
                console.error(`Agent: Error executing plan step "${currentStepDescription}":`, error);
                const errMsg = `Error processing step "${currentStepDescription}": ${error.message}`;
                webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errMsg, error: true } });
                webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: currentStepIndex, description: currentStepDescription, summary: errMsg, planStatus: 'in_progress', error: true }});
                objective.chatHistory.push({ speaker: 'system', content: errMsg });
                objective.plan.currentStepIndex = currentStepIndex + 1; // Advance to avoid loop
                objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
                nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
                objective.currentAgentState = nextAgentState;
                dataStore.updateObjectiveById(objectiveId, objective);
                return { httpResponse: { message: errMsg, error: true }, webSocketMessages, nextAgentState };
            }

            if (stepExecutionResult && typeof stepExecutionResult === 'object' && stepExecutionResult.tool_call) {
                const toolCall = stepExecutionResult.tool_call;
                // ... (validation logic as before) ...
                const toolSchema = getToolSchema(toolCall.name);
                let validationErrors = [];
                 if (!toolSchema) {
                    validationErrors.push(`Unknown tool requested: ${toolCall.name}`);
                } else if (toolSchema.parameters && toolSchema.parameters.properties) {
                    // Basic validation, can be expanded
                    const requiredParams = toolSchema.parameters.required || [];
                    for (const reqParam of requiredParams) {
                        if (toolCall.arguments[reqParam] === undefined) {
                            validationErrors.push(`Missing required argument '${reqParam}' for tool ${toolCall.name}.`);
                        }
                    }
                }

                if (validationErrors.length > 0) {
                    const valErrorMsg = `Tool argument validation failed: ${validationErrors.join(' ')}`;
                    webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: valErrorMsg, error: true } });
                    webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: currentStepIndex, description: currentStepDescription, summary: valErrorMsg, planStatus: 'in_progress', error: true }});
                    objective.chatHistory.push({ speaker: 'system', content: valErrorMsg });
                    // Decide how to proceed: retry step, skip, or halt. For now, advance.
                    objective.plan.currentStepIndex = currentStepIndex + 1;
                    objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
                    nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
                } else {
                    // Valid tool_call, request approval
                    const interactionId = generateInteractionId();
                    objective.pendingToolCall = {
                        name: toolCall.name,
                        arguments: toolCall.arguments,
                        stepIndex: currentStepIndex,
                        interactionId: interactionId,
                        currentStepDescription: currentStepDescription // Store for context
                    };
                    nextAgentState = 'awaiting_tool_approval';
                    webSocketMessages.push({
                        type: 'tool_approval_request',
                        payload: { objectiveId, stepIndex: currentStepIndex, interactionId, toolName: toolCall.name, toolArguments: toolCall.arguments, purpose: `To complete step: "${currentStepDescription}"` }
                    });
                    httpResponse = { message: `Waiting for approval to use tool: ${toolCall.name}` };
                }
            } else if (typeof stepExecutionResult === 'string') {
                // Direct text response from step execution
                const stepSummary = stepExecutionResult;
                webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: stepSummary } });
                objective.chatHistory.push({ speaker: 'agent', content: stepSummary });
                webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: currentStepIndex, description: currentStepDescription, summary: stepSummary, planStatus: 'in_progress' }});
                objective.plan.currentStepIndex = currentStepIndex + 1;
                objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
                nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
                httpResponse = { message: stepSummary };
            } else {
                // Unexpected result
                const errMsg = "Unexpected result from plan step execution.";
                webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errMsg, error: true } });
                webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: currentStepIndex, description: currentStepDescription, summary: errMsg, planStatus: 'in_progress', error: true }});
                objective.chatHistory.push({ speaker: 'system', content: errMsg });
                objective.plan.currentStepIndex = currentStepIndex + 1;
                objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
                nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
                httpResponse = { message: errMsg, error: true };
            }
        } else { // currentStepIndex >= objective.plan.steps.length
             objective.plan.status = 'completed';
             nextAgentState = 'idle';
             const completionMessage = 'All plan steps completed!';
             webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: completionMessage } });
             objective.chatHistory.push({ speaker: 'agent', content: completionMessage });
             httpResponse = { message: completionMessage, planStatus: 'completed' };
        }
    } else if (objective.plan.status === 'completed') {
        nextAgentState = 'idle';
        const completionMessage = 'This objective\'s plan is already completed.';
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: completionMessage } });
        httpResponse = { message: completionMessage, planStatus: 'completed' };
    }
    // ... (Recurrence logic might fit here or after this main block) ...
    // For now, focusing on the interactive flow. Recurrence will be handled if plan status becomes 'completed'.
     if (objective.plan.status === 'completed' && nextAgentState === 'idle') {
        // ... (Simplified Recurrence Logic from original, to be refined) ...
        if (objective.isRecurring && objective.recurrenceRule && objective.originalPlan) {
            // Schedule next run, update objective.nextRunTime, reset plan to pending_scheduling
            console.log(`Agent: Objective ${objectiveId} completed and is recurring. Scheduling next run.`);
             // This part needs the full recurrence calculation logic
        }
    }


    objective.currentAgentState = nextAgentState;
    dataStore.updateObjectiveById(objectiveId, objective); // Save all changes to objective

    return { httpResponse, webSocketMessages, nextAgentState };
}


/**
 * Handles the response from a user regarding a pending budget inquiry.
 * @param {string} objectiveId - The ID of the objective.
 * @param {string} budgetInput - The user's input for the budget.
 * @returns {Promise<Object>} Structured response for server.
 */
async function handleBudgetInquiryResponse(objectiveId, budgetInput) {
    const objective = dataStore.findObjectiveById(objectiveId);
    const webSocketMessages = [];
    let httpResponse = {};
    let nextAgentState = 'processing'; // Default after handling input

    if (!objective || !objective.pendingToolBudgetInquiry) {
        const errorMsg = "Error: No pending budget inquiry found to handle.";
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errorMsg, error: true } });
        return { httpResponse: { message: errorMsg, error: true }, webSocketMessages, nextAgentState: 'idle' };
    }

    const pendingInfo = objective.pendingToolBudgetInquiry;
    objective.chatHistory.push({ speaker: 'user', content: budgetInput });

    const isValidBudget = (input) => String(input).replace(/[\s$,€£¥]/g, '').match(/^\d+(\.\d{1,2})?$/) && parseFloat(String(input).replace(/[\s$,€£¥]/g, '')) > 0;

    if (!isValidBudget(budgetInput)) {
        const errMsg = "Invalid budget format. Please provide a positive number (e.g., 100 or $100.50). The campaign creation step cannot proceed.";
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errMsg } });
        objective.chatHistory.push({ speaker: 'agent', content: errMsg });
        objective.pendingToolBudgetInquiry = null; // Clear inquiry
        // Mark step as failed or requiring different action
        // For now, advance plan to avoid loop, but this step is effectively skipped/failed.
        objective.plan.currentStepIndex = (pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex) + 1;
        objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
        nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
        httpResponse = { message: errMsg, error: true, planStatus: objective.plan.status };
    } else {
        const budgetConfirmationMsg = `Budget of ${budgetInput} accepted. Proceeding with campaign creation...`;
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: budgetConfirmationMsg } });
        objective.chatHistory.push({ speaker: 'agent', content: budgetConfirmationMsg });

        let parsedCampaignConfig;
        try {
            parsedCampaignConfig = JSON.parse(pendingInfo.generatedConfig);
        } catch (e) {
            const parseErrorMsg = "Error: Could not retrieve saved campaign details. Please try creating the campaign again.";
            webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: parseErrorMsg, error: true } });
            objective.chatHistory.push({ speaker: 'agent', content: parseErrorMsg });
            objective.pendingToolBudgetInquiry = null;
            objective.plan.currentStepIndex = (pendingInfo.originalToolCall.stepIndex !== undefined ? pendingInfo.originalToolCall.stepIndex : objective.plan.currentStepIndex) + 1;
            objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
            nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
            httpResponse = { message: parseErrorMsg, error: true, planStatus: objective.plan.status };
            objective.currentAgentState = nextAgentState;
            dataStore.updateObjectiveById(objectiveId, objective);
            return { httpResponse, webSocketMessages, nextAgentState };
        }

        const toolApiResult = await toolExecutorService.execute_google_ads_create_campaign_from_config(
            parsedCampaignConfig,
            budgetInput,
            pendingInfo.projectId
        );
        webSocketMessages.push({ type: 'tool_result', payload: { objectiveId, toolName: pendingInfo.originalToolCall.name, output: toolApiResult, error: null } });
        objective.chatHistory.push({ speaker: 'system', content: `Tool ${pendingInfo.originalToolCall.name} (with budget) output: ${toolApiResult}` });

        const originalStepDescription = objective.plan.steps[pendingInfo.originalToolCall.stepIndex];
        const summaryPrompt = await getPrompt('agent/budget_submission_summary', {
            toolApiResult: toolApiResult,
            originalStepDescription: originalStepDescription
        });
        let summaryMsg;
        try {
            summaryMsg = await geminiService.fetchGeminiResponse(summaryPrompt, objective.chatHistory, []);
             if (typeof summaryMsg !== 'string') summaryMsg = "Campaign creation process finished. Unexpected summary format.";
        } catch (error) {
            summaryMsg = `Campaign creation process finished. Error getting AI summary: ${error.message}. Tool output: ${toolApiResult}`;
        }
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: summaryMsg } });
        objective.chatHistory.push({ speaker: 'agent', content: summaryMsg });

        webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: pendingInfo.originalToolCall.stepIndex, description: originalStepDescription, summary: summaryMsg, planStatus: 'in_progress' }});

        objective.pendingToolBudgetInquiry = null;
        objective.plan.currentStepIndex = pendingInfo.originalToolCall.stepIndex + 1;
        objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
        nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
        httpResponse = { message: summaryMsg, planStatus: objective.plan.status };
    }

    objective.currentAgentState = nextAgentState;
    dataStore.updateObjectiveById(objectiveId, objective);
    return { httpResponse, webSocketMessages, nextAgentState };
}


/**
 * Handles the user's response to a tool approval request.
 * @param {string} objectiveId The ID of the current objective.
 * @param {Object} approvalPayload Contains { approved: boolean, interactionId: string }
 * @returns {Promise<Object>} Structured response: { webSocketMessages, nextAgentState }
 */
async function handleToolApprovalResponse(objectiveId, approvalPayload) {
    const objective = dataStore.findObjectiveById(objectiveId);
    const webSocketMessages = [];
    let nextAgentState = 'processing'; // Default after handling

    if (!objective || !objective.pendingToolCall || objective.pendingToolCall.interactionId !== approvalPayload.interactionId) {
        const errorMsg = "Error: No valid pending tool call found for this approval response or interaction ID mismatch.";
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: errorMsg, error: true } });
        if(objective) { // If objective exists, reset its state
            objective.pendingToolCall = null;
            objective.currentAgentState = 'idle'; // Or 'processing' to retry step? For now, idle.
            dataStore.updateObjectiveById(objectiveId, objective);
            nextAgentState = objective.currentAgentState;
        } else {
            nextAgentState = 'error';
        }
        return { webSocketMessages, nextAgentState };
    }

    const pendingCall = objective.pendingToolCall;
    const currentStepDescription = pendingCall.currentStepDescription || objective.plan.steps[pendingCall.stepIndex]; // Fallback
    objective.pendingToolCall = null; // Clear it once processed

    if (approvalPayload.approved) {
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: `Tool ${pendingCall.name} use approved. Executing...` } });
        objective.chatHistory.push({ speaker: 'system', content: `User approved tool ${pendingCall.name}.` });

        let toolOutput;
        try {
            toolOutput = await executeTool(pendingCall.name, pendingCall.arguments, objective.projectId, objective);
        } catch (execError) {
            console.error(`Agent: Error executing tool ${pendingCall.name} after approval:`, execError);
            const toolErrorMsg = `Error during execution of tool ${pendingCall.name}: ${execError.message}`;
            webSocketMessages.push({ type: 'tool_result', payload: { objectiveId, interactionId: approvalPayload.interactionId, toolName: pendingCall.name, output: null, error: toolErrorMsg } });
            objective.chatHistory.push({ speaker: 'system', content: `Tool ${pendingCall.name} execution failed: ${toolErrorMsg}` });
            // Summarize failure or just report?
            webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: toolErrorMsg, error: true } });
            webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: pendingCall.stepIndex, description: currentStepDescription, summary: toolErrorMsg, planStatus: 'in_progress', error: true }});
            // Advance step to avoid getting stuck
            objective.plan.currentStepIndex = pendingCall.stepIndex + 1;
            objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
            nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
            objective.currentAgentState = nextAgentState;
            dataStore.updateObjectiveById(objectiveId, objective);
            return { webSocketMessages, nextAgentState };
        }

        // Handle BUDGET_NEEDED if returned by executeTool
        if (toolOutput && toolOutput.askUserInput && toolOutput.forBudgetInquiry) {
            webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: toolOutput.message, requiresInput: true } });
            objective.chatHistory.push({ speaker: 'agent', content: toolOutput.message });
            // pendingToolBudgetInquiry would have been set inside executeTool
            nextAgentState = 'awaiting_budget_input';
            // Step does not complete yet; it's paused for budget.
        } else {
            // Standard tool output processing
            webSocketMessages.push({ type: 'tool_result', payload: { objectiveId, interactionId: approvalPayload.interactionId, toolName: pendingCall.name, output: toolOutput, error: null } });
            objective.chatHistory.push({ speaker: 'system', content: `Tool ${pendingCall.name} output: ${typeof toolOutput === 'object' ? JSON.stringify(toolOutput) : toolOutput}` });

            const project = dataStore.findProjectById(objective.projectId);
            const projectAssets = project ? project.assets : [];
            const summaryPrompt = await getPrompt('agent/tool_output_summary', {
                toolName: pendingCall.name,
                toolArguments: JSON.stringify(pendingCall.arguments),
                toolOutput: (typeof toolOutput === 'object' ? JSON.stringify(toolOutput) : String(toolOutput)),
                currentStep: currentStepDescription
            });
            let summaryMsg;
            try {
                summaryMsg = await geminiService.fetchGeminiResponse(summaryPrompt, objective.chatHistory, projectAssets);
                if (typeof summaryMsg !== 'string') {
                     console.error("Agent: Summary response from Gemini was not a string:", summaryMsg);
                     summaryMsg = "Tool execution finished. Received an unexpected internal confirmation format.";
                }
            } catch (error) {
                 console.error("Agent: Error fetching summary from Gemini after tool approval and execution:", error);
                 summaryMsg = `Tool execution finished. Error getting AI summary: ${error.message}. Tool output was: ${typeof toolOutput === 'object' ? JSON.stringify(toolOutput) : toolOutput}`;
            }
            webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: summaryMsg } });
            objective.chatHistory.push({ speaker: 'agent', content: summaryMsg });

            webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: pendingCall.stepIndex, description: currentStepDescription, summary: summaryMsg, planStatus: 'in_progress' }});
            objective.plan.currentStepIndex = pendingCall.stepIndex + 1;
            objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
            nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing';
        }
    } else { // Tool use denied
        const denialMsg = `User denied the use of tool: ${pendingCall.name}. Cannot complete step: "${currentStepDescription}" as planned.`;
        webSocketMessages.push({ type: 'agent_message', payload: { objectiveId, text: denialMsg } });
        objective.chatHistory.push({ speaker: 'system', content: `User denied tool ${pendingCall.name}.` });
        objective.chatHistory.push({ speaker: 'agent', content: denialMsg });

        webSocketMessages.push({ type: 'progress_update', payload: { event: 'step_completed', objectiveId, stepIndex: pendingCall.stepIndex, description: currentStepDescription, summary: 'Tool use denied by user.', planStatus: 'in_progress', error: true }});
        // Agent might try to replan or ask Gemini for alternative. For now, advance.
        objective.plan.currentStepIndex = pendingCall.stepIndex + 1;
        objective.plan.status = (objective.plan.currentStepIndex >= objective.plan.steps.length) ? 'completed' : 'in_progress';
        nextAgentState = objective.plan.status === 'completed' ? 'idle' : 'processing'; // Or 'idle' to wait for user
    }

    objective.currentAgentState = nextAgentState;
    dataStore.updateObjectiveById(objectiveId, objective);
    return { webSocketMessages, nextAgentState };
}


async function initializeAgent(objectiveId) {
    const objective = dataStore.findObjectiveById(objectiveId);
    if (!objective) {
        throw new Error(`Objective with ID ${objectiveId} not found.`);
    }
    objective.currentAgentState = 'initializing_plan'; // Set state
    dataStore.updateObjectiveById(objectiveId, objective);


    const project = dataStore.findProjectById(objective.projectId);
    const projectAssets = project ? project.assets : [];
    let planData;
    try {
        planData = await geminiService.generatePlanForObjective(objective, projectAssets);

        if (planData.planError) {
            objective.plan.status = 'error_generating_plan';
            objective.plan.steps = [];
            objective.plan.questions = [planData.errorMessageForUser + " You can try again by typing '/retry plan'."];
            objective.plan.canRetryPlanGeneration = planData.canRetryPlanGeneration;
            objective.currentAgentState = 'idle'; // Reset state
            dataStore.updateObjectiveById(objective.id, objective);
            throw new Error(planData.errorMessageForUser);
        }

        const { planSteps, questions } = planData;
        objective.plan.steps = Array.isArray(planSteps) ? planSteps : [];
        objective.plan.questions = Array.isArray(questions) ? questions : [];
        objective.plan.status = 'pending_approval';
        objective.plan.currentStepIndex = 0; // Initialize step index
        objective.plan.canRetryPlanGeneration = false;
        objective.currentAgentState = 'awaiting_plan_approval'; // Update state

    } catch (error) {
        if (objective.plan.status !== 'error_generating_plan') {
            objective.plan.status = 'error_generating_plan';
            objective.plan.steps = [];
            objective.plan.questions = [`Failed to generate plan: ${error.message}. You can try again by typing '/retry plan'.`];
            objective.plan.canRetryPlanGeneration = true;
        }
        objective.currentAgentState = 'idle'; // Reset state
        dataStore.updateObjectiveById(objective.id, objective);
        throw error;
    }

    if (objective.isRecurring && objective.plan.status === 'pending_approval') {
        objective.originalPlan = {
            steps: JSON.parse(JSON.stringify(objective.plan.steps)),
            questions: JSON.parse(JSON.stringify(objective.plan.questions)),
        };
    }

    dataStore.updateObjectiveById(objectiveId, objective);
    return objective;
}

module.exports = {
  getAgentResponse,
  initializeAgent,
  handleToolApprovalResponse, // Export new handler
  handleBudgetInquiryResponse, // Export new handler
};
