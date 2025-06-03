# Project Title: AI-Powered Social Media Management Tool

This project is an AI-powered social media management tool that helps users streamline their social media marketing efforts. It allows users to create projects, connect their social media accounts, define objectives, and leverage an AI agent to generate content, schedule posts, and analyze performance.

## Installation and Setup

### Prerequisites

- Node.js (version X.X.X or higher)
- npm (version X.X.X or higher)

### Steps

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root of the project and add the necessary environment variables (see the "Environment Variables" section below).

4. **Run the application:**
   ```bash
   npm start
   ```
   The application should now be running on `http://localhost:3000` (or your configured port).

## How to Use the Application

### 1. Creating Projects
- Once logged in, you can create new projects to organize your social media campaigns.
- Each project can have its own set of connected social media accounts and objectives.

### 2. Connecting Social Media Accounts
- Navigate to the project settings.
- Connect your Facebook, Instagram, Twitter, and LinkedIn accounts by providing the necessary authorizations.

### 3. Managing Objectives
- Define clear objectives for each project (e.g., increase engagement, grow followers, drive website traffic).
- The AI agent will use these objectives to tailor its content suggestions and strategies.

### 4. Interacting with the AI Agent
- **Content Generation:** The AI agent can help you create engaging posts, suggest relevant hashtags, and find trending topics.
- **Scheduling:** Plan and schedule your posts across multiple platforms.
- **Analytics:** The AI agent provides insights into your social media performance, helping you understand what's working and what's not.
- **Chat Interface:** Communicate with the AI agent through a chat interface to get assistance, ask questions, or request specific actions.

## Project Structure

- **`src/`**: Contains the main source code for the application.
    - **`components/`**: Reusable UI components.
    - **`pages/`**: Top-level page components.
    - **`services/`**: Modules for interacting with APIs and backend services.
    - **`store/`**: State management (e.g., Redux, Context API).
    - **`utils/`**: Utility functions.
- **`public/`**: Static assets like images, fonts, and the `index.html` file.
- **`tests/`**: Contains all the test files for the application.
    - **`unit/`**: Unit tests for individual components and functions.
    - **`integration/`**: Integration tests for different parts of the application working together.
    - **`e2e/`**: End-to-end tests simulating user scenarios.

## Running Tests

To run the test suite:

```bash
npm test
```

This will execute all unit, integration, and end-to-end tests. You can also run specific types of tests:

- **Unit tests:** `npm run test:unit`
- **Integration tests:** `npm run test:integration`
- **End-to-end tests:** `npm run test:e2e` (ensure the application is running or the test runner is configured to start it)

## Environment Variables

The following environment variables are required to run the application. Create a `.env` file in the root of your project and add them:

- **`NODE_ENV`**: The application environment (e.g., `development`, `production`, `test`).
- **`PORT`**: The port on which the application will run (e.g., `3000`).
- **`REACT_APP_API_BASE_URL`**: The base URL for your backend API.

### Social Media API Keys

- **`FACEBOOK_APP_ID`**: Your Facebook App ID. You can get this by creating an app on the [Facebook for Developers](https://developers.facebook.com/) portal.
- **`FACEBOOK_APP_SECRET`**: Your Facebook App Secret. Found in your Facebook app settings.
- **`GOOGLE_CLIENT_ID`**: Your Google Client ID for Google authentication (if applicable). Obtain this from the [Google Cloud Console](https://console.cloud.google.com/).
- **`GOOGLE_CLIENT_SECRET`**: Your Google Client Secret.
- **`INSTAGRAM_CLIENT_ID`**: (If using direct Instagram API, often managed via Facebook App)
- **`INSTAGRAM_CLIENT_SECRET`**: (If using direct Instagram API)
- **`TWITTER_API_KEY`**: Your Twitter API Key (Consumer Key). Get this from the [Twitter Developer Portal](https://developer.twitter.com/).
- **`TWITTER_API_SECRET_KEY`**: Your Twitter API Secret Key (Consumer Secret).
- **`TWITTER_BEARER_TOKEN`**: Your Twitter Bearer Token.
- **`LINKEDIN_CLIENT_ID`**: Your LinkedIn Client ID. Create an app on the [LinkedIn Developer Portal](https://developer.linkedin.com/).
- **`LINKEDIN_CLIENT_SECRET`**: Your LinkedIn Client Secret.

### AI Agent API Key

- **`OPENAI_API_KEY`**: (Or other AI provider) API key for the AI language model service.

**Note:** Ensure that you have configured the redirect URIs and other necessary settings correctly in the respective developer portals for the social media platforms.
