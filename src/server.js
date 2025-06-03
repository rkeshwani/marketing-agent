const express = require('express');
const path = require('path'); // Import the 'path' module
const agent = require('./agent');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
// Assuming server.js is in src, and public is one level up from src
app.use(express.static(path.join(__dirname, '..', 'public')));

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { userInput, chatHistory } = req.body;

    if (!userInput) {
      return res.status(400).json({ error: 'userInput is required' });
    }

    // chatHistory can be optional or defaults to an empty array if not provided
    const history = chatHistory || [];

    const agentResponse = await agent.getAgentResponse(userInput, history);
    res.json({ response: agentResponse });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Failed to get agent response' });
  }
});

// All other GET requests not handled by the static middleware or API routes
// should serve the main client application (index.html).
// This is important for single-page applications (SPAs) and PWA navigation.
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log('PWA client should be accessible at http://localhost:${port}/');
});
