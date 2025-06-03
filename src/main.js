const readline = require('node:readline/promises'); // Using promise-based readline
const { stdin: input, stdout: output } = require('node:process');

const agent = require('./agent');
const ChatHistory = require('./chatHistory');

async function main() {
  const rl = readline.createInterface({ input, output });
  const chatHistory = new ChatHistory();

  console.log("Agentic Chat Application");
  console.log("Type 'exit' to end the chat.");
  console.log("--------------------------");

  try {
    while (true) {
      const userInput = await rl.question('You: ');

      if (userInput.toLowerCase() === 'exit') {
        console.log('Exiting chat...');
        break;
      }

      chatHistory.addMessage('user', userInput);

      // Get agent's response
      // The agent's getAgentResponse is async, so we await it
      const agentResponse = await agent.getAgentResponse(userInput, chatHistory.getHistory());

      chatHistory.addMessage('agent', agentResponse);
      console.log(`Agent: ${agentResponse}`);
    }
  } catch (error) {
    console.error("An error occurred in the main loop:", error);
  } finally {
    rl.close();
  }
}

// Run the main function
main().catch(error => {
  console.error("Failed to run the application:", error);
  process.exit(1);
});
