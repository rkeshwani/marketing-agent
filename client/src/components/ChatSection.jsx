import React, { useEffect } from 'react';
// Plan display and manual chat logic will be handled by CopilotKit and its generative UI features

function ChatSection({ selectedObjective, onBackToObjectives }) {

  useEffect(() => {
    if (selectedObjective && selectedObjective.id) {
      // Here, we might need to inform CopilotKit about the current objective context.
      // This could be via a custom event, updating some shared context,
      // or by relying on the backend to associate the user's session with this objective.
      // For now, we assume the CopilotSidebar will pick up the context or the backend
      // will handle it based on user session or other means.
      console.log(`ChatSection: Objective changed to ${selectedObjective.title} (ID: ${selectedObjective.id})`);

      // If CopilotKit requires an explicit context/conversation ID to be set:
      // Example (hypothetical, API might differ):
      // CopilotKit.setContext({ objectiveId: selectedObjective.id });
      // CopilotKit.setConversationId(selectedObjective.id);

    }
  }, [selectedObjective]);

  if (!selectedObjective) {
    // This component might not even be rendered if no objective is selected,
    // but as a fallback:
    return (
        <div id="chat-section-placeholder" style={{padding: '20px', textAlign: 'center'}}>
             <div className="message agent-message" style={{alignSelf: 'center', backgroundColor: '#e9ecef', display: 'inline-block', padding: '10px 15px', borderRadius: '18px'}}>
                Select a project and an objective to begin.
            </div>
        </div>
    );
  }

  // The actual chat interface is now expected to be the <CopilotSidebar />
  // This ChatSection component now primarily serves to:
  // 1. Indicate which objective is active.
  // 2. Potentially house objective-specific information or actions NOT part of the chat.
  // 3. Display generative UI elements spawned by agent actions for this objective.

  return (
    <div id="chat-section-main-area"> {/* Updated ID to avoid conflict if old CSS for #chat-section has specific layout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Objective: {selectedObjective.title}</h2>
        <button onClick={onBackToObjectives} type="button" id="back-to-objectives-button">&larr; Back to Objectives</button>
      </div>

      {/*
        The plan display, chat history, and chat input are now handled by CopilotKit components (e.g., CopilotSidebar).
        This area can be used to display generative UI elements related to the active objective's tasks and agent actions.
        For example, if an agent action is to display a research summary, that component would render here.
      */}
      <p>Engage with the Marketing Copilot in the sidebar to work on this objective.</p>
      <p>Agent actions and detailed progress related to "<strong>{selectedObjective.title}</strong>" will appear here as generative UI components when the agent performs tasks.</p>

      {/* Placeholder for where generative UI components from agent actions might render */}
      <div id="copilotkit-generative-ui-objective-area">
        {/* Example: <ResearchSummaryView data={...} /> */}
      </div>
    </div>
  );
}

export default ChatSection;
