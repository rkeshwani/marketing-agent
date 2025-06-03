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
- Connect your Facebook, TikTok, and LinkedIn accounts by providing the necessary authorizations.
- Connect Google Drive for asset management within your projects.

### 3. Managing Objectives
- Define clear objectives for each project (e.g., increase engagement, grow followers, drive website traffic).
- The AI agent will use these objectives to tailor its content suggestions and strategies.

### 4. Interacting with the AI Agent
- **Content Generation:** The AI agent, powered by Gemini, can help you create engaging posts, suggest relevant hashtags, and find trending topics.
- **Scheduling:** Plan and schedule your posts across multiple platforms.
- **Analytics:** The AI agent provides insights into your social media performance, helping you understand what's working and what's not.
- **Chat Interface:** Communicate with the AI agent through a chat interface to get assistance, ask questions, or request specific actions.

## Project Structure

- **`src/`**: Contains the main source code for the application.
    - **`components/`**: Reusable UI components.
    - **`pages/`**: Top-level page components.
    - **`services/`**: Modules for interacting with APIs and backend services (including `geminiService.js`).
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

- **Unit tests:** `npm run test:unit` (Note: specific script might need to be added to package.json)
- **Integration tests:** `npm run test:integration` (Note: specific script might need to be added to package.json)
- **End-to-end tests:** `npm run test:e2e` (Note: specific script might need to be added to package.json)

## Environment Variables

The following environment variables are required to run the application. Create a `.env` file in the root of your project and add them:

- **`NODE_ENV`**: The application environment (e.g., `development`, `production`, `test`). Defaults to `development`.
- **`PORT`**: The port on which the application will run (e.g., `3000`). Defaults to `3000`.
- **`APP_BASE_URL`**: The base URL of the application, including the protocol (e.g., `http://localhost:3000`). Used for constructing callback URLs.
- **`REACT_APP_API_BASE_URL`**: The base URL for your backend API, used by the client-side (if applicable).
- **`SESSION_SECRET`**: A secret key for session management.

### Social Media & Service API Keys

- **`FACEBOOK_APP_ID`**: Your Facebook App ID. Get this from the [Facebook for Developers](https://developers.facebook.com/) portal.
- **`FACEBOOK_APP_SECRET`**: Your Facebook App Secret. Found in your Facebook app settings.
- **`TIKTOK_CLIENT_KEY`**: Your TikTok Client Key. Get this from the [TikTok Developer Portal](https://developers.tiktok.com/).
- **`TIKTOK_CLIENT_SECRET`**: Your TikTok Client Secret.
- **`GOOGLE_CLIENT_ID`**: Your Google Client ID. Obtain this from the [Google Cloud Console](https://console.cloud.google.com/) for Google Drive integration.
- **`GOOGLE_CLIENT_SECRET`**: Your Google Client Secret.
- **`GOOGLE_REDIRECT_URI`**: The callback URI for Google OAuth. This is typically `${APP_BASE_URL}/auth/google/callback`. Ensure this is registered in your Google Cloud Console credentials.

- **`LINKEDIN_APP_ID`**: Your LinkedIn Application ID (Client ID). Get this from the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps).
- **`LINKEDIN_APP_SECRET`**: Your LinkedIn Application Secret (Client Secret). Found in your LinkedIn app settings.
    - **Important for LinkedIn Callback**: Ensure you add `${APP_BASE_URL}/auth/linkedin/callback` as an authorized redirect URI in your LinkedIn app settings.

### AI Agent API Key

- **`GEMINI_API_KEY`**: API key for the Gemini AI language model service.

### LinkedIn Scopes and Permissions
The application requires the following OAuth scopes for LinkedIn integration. These are requested during the "Connect LinkedIn" process:
- **`r_liteprofile`**: Used to retrieve your basic profile information, such as your name and LinkedIn ID. This helps in personalizing the connection within the app.
- **`r_emailaddress`**: Used to fetch the primary email address associated with your LinkedIn account. This can be used for identification or communication if needed.
- **`w_member_social`**: Required to post content (shares or User Generated Content - UGC posts) to LinkedIn on your behalf. This is essential for the "post_to_linkedin" tool.

**Note:** Ensure that you have configured the redirect URIs and other necessary settings correctly in the respective developer portals for the connected services.
For Node.js version, refer to the `engines` field in `package.json` if present, or use a recent LTS version. For npm, it usually comes bundled with Node.js.
The test scripts `test:unit`, `test:integration`, `test:e2e` are examples and may need to be configured in `package.json`. The generic `npm test` relies on Jest configuration.
