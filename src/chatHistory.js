// Using a class to manage chat history
class ChatHistory {
  constructor() {
    this.history = [];
  }

  /**
   * Adds a message to the chat history.
   * @param {string} speaker - Who said the message ('user' or 'agent').
   * @param {string} text - The content of the message.
   */
  addMessage(speaker, text) {
    if (!speaker || !text) {
      console.error('ChatHistory: Speaker and text are required to add a message.');
      return;
    }
    if (typeof speaker !== 'string' || typeof text !== 'string') {
      console.error('ChatHistory: Speaker and text must be strings.');
      return;
    }
    if (speaker.toLowerCase() !== 'user' && speaker.toLowerCase() !== 'agent') {
      console.error('ChatHistory: Speaker must be "user" or "agent".');
      return;
    }

    const message = {
      speaker: speaker.toLowerCase(),
      text: text,
      timestamp: new Date(),
    };
    this.history.push(message);
    console.log(`ChatHistory: Added message from ${speaker}: "${text}"`);
  }

  /**
   * Retrieves the entire chat history.
   * @returns {Array<Object>} The chat history.
   */
  getHistory() {
    return [...this.history]; // Return a copy to prevent external modification
  }

  /**
   * Clears the chat history.
   */
  clearHistory() {
    this.history = [];
    console.log('ChatHistory: History cleared.');
  }
}

// Export the class
module.exports = ChatHistory;
