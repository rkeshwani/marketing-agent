import './globals.css'; // Will create this file later with styles
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from "@copilotkit/react-ui";

export const metadata = {
  title: 'Agentic Marketing Platform',
  description: 'AI Powered Marketing Agent Platform',
};

export default function RootLayout({ children }) {
  // The selectedObjectiveId for the CopilotKit body will need to be managed
  // by a client component that wraps {children} or passed via context.
  // For now, starting without it in the CopilotKit provider here,
  // as this RootLayout is a Server Component.
  // We will handle objective-specific context for CopilotKit within a client component.

  return (
    <html lang="en">
      <body>
        <CopilotKit runtimeUrl="/api/agent/"> {/* Default runtimeUrl */}
          <div id="app-container">
            <header>
              <h1>Marketing Agent Platform</h1>
            </header>
            {children} {/* This will be the content from page.js */}
            <footer>
              <p>&copy; 2024 Marketing Agent Co.</p>
            </footer>
            <CopilotSidebar
              labels={{
                title: "Marketing Copilot",
                initial: "Hi there! How can I help you with your marketing objective?"
              }}
              defaultOpen={true}
              clickOutsideToClose={false} // Keep sidebar open
            />
          </div>
        </CopilotKit>
      </body>
    </html>
  );
}
