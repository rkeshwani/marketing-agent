'use client'; // Add use client for Next.js App Router client components

import React, { useEffect } from 'react';
// We might use CopilotKit hooks here later if we build a custom UI for actions/tasks
// import { useCopilotAction, useCopilotReadable } from "@copilotkit/react-core";

function ChatSection({ selectedObjective, onBackToObjectives }) {

  useEffect(() => {
    if (selectedObjective && selectedObjective.id) {
      // This is where we would ensure CopilotKit's context is set for the selectedObjective.id
      // For now, this is handled by passing selectedObjectiveId in the body of CopilotKit requests (see root layout/page)
      console.log(`ChatSection: Objective active: ${selectedObjective.title} (ID: ${selectedObjective.id})`);
    }
  }, [selectedObjective]);

  if (!selectedObjective) {
    // This view is typically shown when no objective is selected,
    // handled by the main page logic. This is a fallback.
    return (
        <div id="chat-section-placeholder" style={{padding: '20px', textAlign: 'center'}}>
             <div className="message agent-message" style={{alignSelf: 'center', backgroundColor: '#e9ecef', display: 'inline-block', padding: '10px 15px', borderRadius: '18px'}}>
                Select an objective to see details and interact with the Copilot.
            </div>
        </div>
    );
  }

  // The main chat interaction is via CopilotSidebar (or other CopilotKit UI components).
  // This section will display the active objective and be the container for
  // any generative UI components rendered by agent actions.
  return (
    <div id="chat-section-main-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Objective: {selectedObjective.title || 'No Title'}</h2>
        {onBackToObjectives && ( // Conditionally render back button
            <button onClick={onBackToObjectives} type="button" id="back-to-objectives-button">&larr; Back to Objectives</button>
        )}
      </div>

      <p>Interact with the Marketing Copilot using the sidebar to work on "<strong>{selectedObjective.title}</strong>".</p>
      <p>Agent actions and specific UI components related to this objective will appear below.</p>

      {/* This div is intended as a target for CopilotKit's generative UI rendering.
          When the agent describes a UI component (e.g., a research summary card),
          CopilotKit's frontend logic (using <RenderCopilotResponsecomponents /> or similar)
          would render the actual React component here.
          The tools defined in the backend for the agent will specify these UI components.
      */}
      <div id="copilotkit-generative-ui-objective-area" style={{ marginTop: '20px', border: '1px dashed #ccc', padding: '10px', minHeight: '100px' }}>
        {/* Placeholder for generative UI. Real components will be rendered here by CopilotKit. */}
        <p style={{color: '#777'}}><em>(Generative UI content for the objective will appear here)</em></p>
      </div>
    </div>
  );
}

export default ChatSection;
