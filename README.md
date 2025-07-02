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
   - For the main backend server:
     ```bash
     npm install
     ```
   - For the Next.js client application:
     ```bash
     cd next_app
     npm install
     cd ..
     ```

3. **Set up environment variables:**
   Create a `.env` file in the root of the project and add the necessary environment variables for the main backend server (see the "Environment Variables" section below). The Next.js application in `next_app/` will also use this `.env` file for variables prefixed with `NEXT_PUBLIC_` (for client-side access) or directly for its server-side parts (like API routes).

4. **Run the application (Development):**
   To run both the backend server and the Next.js client development server concurrently:
   ```bash
   npm run dev
   ```
   - The main backend server will typically run on `http://localhost:3000`.
   - The Next.js client application will typically run on `http://localhost:3001` (or the next available port if 3000 is taken by the backend, `code-server` proxying might alter the public URL). Access the application through the Next.js client URL. API calls from the client to `/api/*` (excluding `/api/agent/*`) will be proxied to the main backend server by Next.js during development.

5. **Run the application (Production - Example):**
   - Build the Next.js client:
     ```bash
     npm run build:client
     ```
   - Start the main backend server (which might also serve the Next.js client if configured for it, or Next.js runs separately):
     ```bash
     npm start
     ```
   - To start the Next.js production client server independently (if not served by the main backend):
     ```bash
     npm run start:client
     ```
   (Production deployment strategies can vary, e.g., using Vercel for Next.js and a separate host for the Node.js backend).


### Local Development with Microsandbox

For local development, especially when working with features that require a secure execution environment for code or specific tool integrations, we use `microsandbox`.

1.  **Install Microsandbox CLI:**
    If you don't have it already, install the `microsandbox` command-line tool.
    ```bash
    npm install -g microsandbox
    ```
    *Note: Depending on your system configuration, you might need to use `sudo` for global installation.*

2.  **Start the Microsandbox Development Server:**
    To run the local server that simulates the microsandbox environment, navigate to your project's root directory and run:
    ```bash
    msb server start --dev
    ```
    This will start a local server, typically on a port like `8000`, which your application can then be configured to use for relevant services.

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

- **`src/`**: Contains the source code for the main backend Node.js/Express server.
    - **`services/`**: Modules for interacting with external APIs (Gemini, social media, etc.) and backend services.
    - **`models/`**: Data models (e.g., Project, Objective).
    - **`providers/`**: Data store provider implementations.
    - **`config/`**: Configuration files.
    - **`tools/`**: Definitions for tools used by the agent.
    - `agent.js`: Core AI agent logic.
    - `dataStore.js`: Data store abstraction layer.
    - `server.js`: The main Express server entry point.
- **`next_app/`**: Contains the Next.js client application.
    - **`src/app/`**: App Router structure, including pages, layouts, and API routes (e.g., `/api/agent/` for CopilotKit).
    - **`src/components/`**: Reusable React components for the Next.js client.
    - **`public/`**: Static assets for the Next.js client (e.g., icons, manifest.json).
    - `next.config.js`: Next.js configuration, including API proxy rewrites.
- **`public/`**: (Root directory) May contain a few remaining static files for auth callbacks (e.g., `finalize-project.html`). This should be minimized as most client assets are now in `next_app/public/`.
- **`tests/`**: Contains backend test files. Client-side tests would reside within `next_app/`.

## Running Tests

To run the backend test suite:

```bash
npm test
```

This will execute all unit, integration, and end-to-end tests. You can also run specific types of tests:

- **Unit tests:** `npm run test:unit` (Note: specific script might need to be added to package.json)
- **Integration tests:** `npm run test:integration` (Note: specific script might need to be added to package.json)
- **End-to-end tests:** `npm run test:e2e` (Note: specific script might need to be added to package.json)

## Environment Variables

The following environment variables are required to run the application. Create a `.env` file in the root of your project and add them:

- **`NODE_ENV`**: The application environment (e.g., `development`, `production`, `test`). Defaults to `development`. Affects both backend and Next.js app.
- **`PORT`**: The port on which the main backend server (`src/server.js`) will run (e.g., `3000`). Defaults to `3000`. The Next.js dev server will run on a separate port (e.g., 3001 or as configured in `next_app/package.json`).
- **`APP_BASE_URL`**: The public base URL of the main backend server, including the protocol (e.g., `http://localhost:3000`). Used by `src/server.js` for constructing auth callback URLs.
- **`NEXT_PUBLIC_...`**: For client-side environment variables in the Next.js app, prefix them with `NEXT_PUBLIC_` in your `.env` file (e.g., `NEXT_PUBLIC_APP_NAME="My App"`). These are bundled into the client.
- **`SESSION_SECRET`**: A secret key for session management in `src/server.js`.

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

The application integrates with the Gemini AI language model service. Ensure the following environment variables are set:

- **`GEMINI_API_KEY`**: Your API key for the Gemini AI language model service.
- **`GEMINI_API_ENDPOINT`**: The API endpoint URL for the Gemini service (e.g., `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`). Refer to the official Gemini documentation for the correct endpoint for your model.

### Vector Service Configuration

The application uses a vector service for managing and searching asset embeddings. This service is designed to be extendable, allowing different vector store providers to be implemented.

- **`VECTOR_STORE_PROVIDER`**: Specifies the vector store provider to use.
    - Default: `inMemory`
    - Currently available options:
        - `inMemory`: Uses a transient, in-memory vector store. Suitable for development and testing. Data is lost when the application restarts.
        - `pinecone`: Uses [Pinecone](https://www.pinecone.io/) as the vector store. Requires a Pinecone account and an existing index.
        - `weaviate`: Uses [Weaviate](https://weaviate.io/) as the vector store. Requires a running Weaviate instance.
        - `chroma`: Uses [ChromaDB](https://www.trychroma.com/) as the vector store. Can connect to a remote Chroma server or run locally (in-memory or file-based).
        - `faiss`: Uses [FAISS](https://faiss.ai/) (via `faiss-node`) for local, file-based vector storage. Index files are stored locally.
    - To implement a new provider (e.g., Pinecone, a database-backed store):
        1. Create a new class in `src/services/` that implements `src/services/vectorStoreInterface.js`.
        2. Update `src/services/vectorService.js` to include your new provider in the `getVectorStore` factory function.
        3. Set the `VECTOR_STORE_PROVIDER` environment variable to the key you defined for your new provider.

- **Pinecone Specific Configuration (if `VECTOR_STORE_PROVIDER="pinecone"`)**:
    - **`PINECONE_API_KEY`**: Your Pinecone API key.
    - **`PINECONE_INDEX_NAME`**: The name of your pre-existing Pinecone index. The dimension of this index should match the embedding dimension used by the application (currently 10, as per `vectorService.generateEmbedding`). Each project's assets will be stored in a namespace within this index, named after the `projectId`.

- **Weaviate Specific Configuration (if `VECTOR_STORE_PROVIDER="weaviate"`)**:
    - **`WEAVIATE_SCHEME`**: The scheme for your Weaviate instance (e.g., `http` or `https`). Default: `http`.
    - **`WEAVIATE_HOST`**: The host and port of your Weaviate instance (e.g., `localhost:8080` or `your-cluster.weaviate.network`). Default: `localhost:8080`.
    - **`WEAVIATE_API_KEY`**: Your Weaviate API key, if authentication is enabled (e.g., for Weaviate Cloud Service). Default: `''`.
    - **`WEAVIATE_CLASS_NAME_PREFIX`**: A prefix used for creating Weaviate classes. Each project's assets will be stored in a class named `{WEAVIATE_CLASS_NAME_PREFIX}{SanitizedProjectId}`. The class will be created automatically if it doesn't exist, with `vectorizer: 'none'` to support manual vector input. Default: `ProjectAsset`.

- **ChromaDB Specific Configuration (if `VECTOR_STORE_PROVIDER="chroma"`)**:
    - **`CHROMA_PATH`**: The URL path to your ChromaDB server (e.g., `http://localhost:8000`). If left empty, ChromaDB will run in-memory (data lost on restart) or use local file persistence if configured by the ChromaDB instance itself. Default: `''`.
    - **`CHROMA_COLLECTION_NAME_PREFIX`**: A prefix for ChromaDB collection names. Each project's assets will be stored in a collection named `{CHROMA_COLLECTION_NAME_PREFIX}{SanitizedProjectId}`. Collections are created automatically if they don't exist. Default: `project-`.

- **FAISS Specific Configuration (if `VECTOR_STORE_PROVIDER="faiss"`)**:
    - **`FAISS_INDEX_PATH`**: Directory path where FAISS index files and their corresponding ID mapping files will be stored. Each project will have its own `.index` and `.mapping.json` file in this directory. Default: `./faiss_indices`.
    - **`FAISS_DEFAULT_DIMENSION`**: The dimension of the vectors to be stored. This must match the output dimension of the embedding model (currently 10). Default: `10`.
    - *Note*: The `faiss-node` library requires FAISS to be installed on the system. This provider is suitable for local development or environments where you can manage this dependency. Performance with frequent additions/removals might degrade over time without periodic index rebuilding (not currently implemented).

### Data Store Configuration

The application uses a data store abstraction to manage project and objective data. This allows different backend data storage solutions to be used.

- **`DATA_PROVIDER`**: Specifies the data store provider to use.
    - Default: `flatfile`
    - Available options:
        - `flatfile`: Uses a local JSON file (`data.json`) for storage. Simple, no external dependencies, but not suitable for production scale.
        - `mongodb`: Uses [MongoDB](https://www.mongodb.com/) as the data store. Requires a running MongoDB instance.
        - `firestore`: Uses [Google Cloud Firestore](https://cloud.google.com/firestore) as the data store. Requires a Google Cloud Platform project and appropriate authentication.
        - `dynamodb`: Uses [Amazon DynamoDB](https://aws.amazon.com/dynamodb/) as the data store. Requires an AWS account, configured tables, and appropriate IAM permissions.
        - `cosmosdb`: Uses [Azure Cosmos DB](https://azure.microsoft.com/en-us/services/cosmos-db/) (SQL API) as the data store. Requires an Azure account and a configured Cosmos DB instance.
    - To implement a new provider:
        1. Create a new class in `src/providers/` that implements `src/interfaces/DataStoreInterface.js`.
        2. Update `src/dataStore.js` to include your new provider in the selection logic based on `DATA_PROVIDER`.
        3. Set the `DATA_PROVIDER` environment variable to the key you defined for your new provider.

- **MongoDB Specific Configuration (if `DATA_PROVIDER="mongodb"`)**:
    - **`MONGODB_URI`**: The MongoDB connection string URI (e.g., `mongodb://localhost:27017` or a MongoDB Atlas URI).
        - Default: `mongodb://localhost:27017`
    - **`MONGODB_DB_NAME`**: The name of the database to use within your MongoDB instance.
        - Default: `agentic_chat_js_db`

- **Firestore Specific Configuration (if `DATA_PROVIDER="firestore"`)**:
    - **`GCLOUD_PROJECT_ID`**: Your Google Cloud Project ID where Firestore is enabled.
        - If not set, the Firestore client library might try to infer it from the environment (e.g., when running on GCP services).
    - **`GOOGLE_APPLICATION_CREDENTIALS`**: Path to your Google Cloud service account key file (JSON).
        - This is the recommended way for authentication when running outside of Google Cloud environments.
        - If not set, the client library will attempt to use Application Default Credentials (ADC), which are automatically available in many Google Cloud environments (e.g., Cloud Run, Cloud Functions, GCE).
        - For local development, you can set this after authenticating via `gcloud auth application-default login`.

- **Amazon DynamoDB Specific Configuration (if `DATA_PROVIDER="dynamodb"`)**:
    - **`AWS_REGION`**: The AWS region where your DynamoDB tables are located (e.g., `us-east-1`, `eu-west-2`).
        - This is a standard AWS SDK environment variable. If not set, the SDK might try to infer it from shared AWS config or an EC2 instance profile. It's best to set it explicitly.
    - **`DYNAMODB_PROJECTS_TABLE`**: The name of your DynamoDB table for storing projects.
        - Default: `agentic-chat-projects`
        - This table should have a primary key `id` (String).
    - **`DYNAMODB_OBJECTIVES_TABLE`**: The name of your DynamoDB table for storing objectives.
        - Default: `agentic-chat-objectives`
        - This table should have a primary key `id` (String).
        - **Important**: For efficient querying of objectives by `projectId`, a Global Secondary Index (GSI) is recommended on this table. The `DynamoDbStore.js` provider will attempt to use a GSI named `ObjectivesByProjectIdIndex` with `projectId` as its partition key. If this GSI doesn't exist, it will fall back to a less efficient Scan operation.
    - **AWS Credentials**: Ensure your environment is configured with AWS credentials (e.g., via `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` environment variables, or an IAM role if running on AWS infrastructure). The application needs permissions to read, write, and query the specified DynamoDB tables.

- **Azure Cosmos DB Specific Configuration (if `DATA_PROVIDER="cosmosdb"`)**:
    - **`COSMOS_ENDPOINT`**: The URI endpoint of your Azure Cosmos DB account (e.g., `https://your-account.documents.azure.com:443/`). **Required.**
    - **`COSMOS_KEY`**: The primary or secondary key for your Cosmos DB account. **Required.**
    - **`COSMOS_DATABASE_ID`**: The ID of the database to use within your Cosmos DB account.
        - Default: `agenticChatDB` (will be created by the provider if it doesn't exist).
    - **`COSMOS_PROJECTS_CONTAINER_ID`**: The ID of the container for storing projects.
        - Default: `Projects` (will be created with partition key `/id` by the provider if it doesn't exist).
    - **`COSMOS_OBJECTIVES_CONTAINER_ID`**: The ID of the container for storing objectives.
        - Default: `Objectives` (will be created with partition key `/projectId` by the provider if it doesn't exist).
    - **Note on Partition Keys**: The `CosmosDbStore.js` provider is implemented with `/id` as the partition key for projects and `/projectId` for objectives. Understanding partition key implications for performance and cost in Cosmos DB is crucial for production deployments. Operations that need to find an objective by its `id` without knowing its `projectId` will perform a cross-partition query, which is less efficient.

### LinkedIn Scopes and Permissions
The application requires the following OAuth scopes for LinkedIn integration. These are requested during the "Connect LinkedIn" process:
- **`r_liteprofile`**: Used to retrieve your basic profile information, such as your name and LinkedIn ID. This helps in personalizing the connection within the app.
- **`r_emailaddress`**: Used to fetch the primary email address associated with your LinkedIn account. This can be used for identification or communication if needed.
- **`w_member_social`**: Required to post content (shares or User Generated Content - UGC posts) to LinkedIn on your behalf. This is essential for the "post_to_linkedin" tool.

**Note:** Ensure that you have configured the redirect URIs and other necessary settings correctly in the respective developer portals for the connected services.
For Node.js version, refer to the `engines` field in `package.json` if present, or use a recent LTS version. For npm, it usually comes bundled with Node.js.
The test scripts `test:unit`, `test:integration`, `test:e2e` are examples and may need to be configured in `package.json`. The generic `npm test` relies on Jest configuration.
