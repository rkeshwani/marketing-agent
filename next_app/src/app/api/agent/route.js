import { CopilotRuntime } from "@copilotkit/backend";
import { OpenAIAdapter } from "@copilotkit/backend"; // Or another adapter if not using OpenAI directly for this endpoint's LLM
import { Readable } from "stream"; // Node.js stream

// Adjust path to access files outside the Next.js app directory
// These paths assume 'next_app' is at the root alongside 'src'
const dataStore = require("../../../src/dataStore");
const { getAgentResponse, initializeAgent } = require("../../../src/agent");
// Note: The main `agent` instance itself from agent.js might not be directly usable
// if its internal state or tool setup is complex and not easily re-instantiated per request.
// We'll primarily use getAgentResponse and initializeAgent.

export async function POST(req) {
  const copilotKitBody = await req.json(); // Get the full body sent by CopilotKit
  const objectiveId = copilotKitBody.objectiveId; // Extract objectiveId

  console.log(`[Next.js API /api/agent] Request received. Objective ID: ${objectiveId}`);

  if (!objectiveId) {
    return new Response(JSON.stringify({ error: "Objective ID is missing in the request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const objective = await dataStore.findObjectiveById(objectiveId);
  if (!objective) {
    return new Response(JSON.stringify({ error: `Objective not found for ID: ${objectiveId}` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const copilotRuntime = new CopilotRuntime();

  try {
    // The handler now directly processes the CopilotKit payload.
    // It needs to extract the user message and call our existing agent logic.
    // The `run` method of CopilotRuntime expects a handler that processes the payload
    // and returns a stream.

    // We need to adapt how getAgentResponse is called and how its response is streamed.
    // CopilotRuntime typically works with LangChain chains or similar constructs
    // that inherently support streaming and tool use in a structured way.
    // Directly calling getAgentResponse and manually creating a stream is possible but less idiomatic
    // for full CopilotKit features like generative UI from tools.

    // For now, let's replicate the text streaming logic from the previous Express endpoint:
    const lastUserMessage = copilotKitBody.messages[copilotKitBody.messages.length - 1];
    if (lastUserMessage.role !== 'user' || !lastUserMessage.content) {
      return new Response(JSON.stringify({ error: "Last message must be from user and have content." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userInput = lastUserMessage.content;
    await dataStore.addMessageToObjectiveChat(objectiveId, 'user', userInput);

    // Call existing agent logic
    const agentResponsePayload = await getAgentResponse(userInput, objective.chatHistory, objectiveId);

    let messageToUser = "Agent processing complete."; // Default message
    if (typeof agentResponsePayload === 'string') {
        messageToUser = agentResponsePayload;
    } else if (typeof agentResponsePayload === 'object' && agentResponsePayload !== null) {
        messageToUser = agentResponsePayload.message || messageToUser;
        if (agentResponsePayload.stepDescription) {
            messageToUser = `${agentResponsePayload.stepDescription}\n\n${messageToUser}`;
        }
        // Persist plan updates if any
        if (agentResponsePayload.planStatus && objective.plan) {
            const updatedPlan = {
                ...objective.plan,
                status: agentResponsePayload.planStatus,
                currentStepIndex: agentResponsePayload.currentStep !== undefined ? agentResponsePayload.currentStep + 1 : objective.plan.currentStepIndex,
            };
            if(agentResponsePayload.planSteps) updatedPlan.steps = agentResponsePayload.planSteps;
            await dataStore.updateObjectiveById(objectiveId, { plan: updatedPlan });
        }
    }

    await dataStore.addMessageToObjectiveChat(objectiveId, 'agent', messageToUser);

    // Manually create a stream for the text response
    const readable = new Readable();
    readable._read = () => {}; // Noop _read is needed for Readable streams
    readable.push(JSON.stringify({ type: "text", content: messageToUser }) + "\n");
    readable.push(null); // End the stream

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Transfer-Encoding": "chunked",
       },
    });

  } catch (error) {
    console.error("[Next.js API /api/agent] Error:", error);
    return new Response(JSON.stringify({ error: "Error processing agent request: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// export const runtime = "edge"; // Remove if using Node.js specific modules like 'stream' or 'fs' from dataStore etc.
// The current dataStore likely uses fs, so edge runtime is not suitable.
