if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed: ', error);
      });
  });
}

document.addEventListener('DOMContentLoaded', () => {
    const userInputElement = document.getElementById('user-input'); // Renamed for clarity
    const sendButton = document.getElementById('send-button');
    const chatOutput = document.getElementById('chat-output');

    // Client-side chat history
    let clientChatHistory = [];

    function addMessageToUI(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'agent-message');
        messageDiv.textContent = text;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight; // Scroll to bottom
    }

    async function handleSendMessage() {
        const messageText = userInputElement.value.trim();
        if (!messageText) return;

        addMessageToUI('user', messageText);
        clientChatHistory.push({ role: 'user', content: messageText }); // Use {role, content} format
        userInputElement.value = '';

        try {
            // Send history *before* this new user message
            const historyToSend = clientChatHistory.slice(0, -1);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userInput: messageText,
                    chatHistory: historyToSend
                }),
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    // If response is not JSON, use status text
                    errorData = { error: response.statusText };
                }
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            const agentResponse = data.response;

            addMessageToUI('agent', agentResponse);
            clientChatHistory.push({ role: 'agent', content: agentResponse }); // Use {role, content} format

        } catch (error) {
            console.error('Error sending message to server:', error);
            addMessageToUI('agent', `Error: ${error.message}`);
            // Optional: If server call fails, you might want to remove the last user message
            // from clientChatHistory, or adjust its state to indicate it wasn't processed.
            // For now, we'll leave it, and the error message from the agent will indicate a problem.
        }
    }

    sendButton.addEventListener('click', handleSendMessage);

    userInputElement.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // Display a welcome message or initial state if needed.
    // (The initial "Welcome to Agentic Chat!" is already in index.html)
    console.log('PWA client app.js loaded and communication logic added.');
});
