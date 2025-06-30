'use client'; // Add use client for Next.js App Router client components

import React, { useState } from 'react';

function CreateObjectiveForm({ projectId, onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => { // Made async to await onSubmit
    event.preventDefault();
    if (!title.trim()) {
      setError('Objective title is required.');
      return;
    }
    setError('');
    try {
      await onSubmit({ projectId, title, brief }); // Assuming onSubmit might be async
      setTitle('');
      setBrief('');
    } catch (submitError) {
      // Error should be handled by the caller (App.js/MainPage.js),
      // but we can set a local error too if needed or if onSubmit doesn't throw for UI.
      // For now, assume caller handles UI feedback for submission errors.
      console.error("Error submitting objective form:", submitError);
      // setError("Failed to create objective. Please try again.");
    }
  };

  return (
    <div className="create-objective-form-instance" style={{ display: 'block' }}>
      {/* The H3 might be part of ProjectListItem or passed as a prop if needed */}
      {/* <h3>Create New Objective</h3>  */}
      <form onSubmit={handleSubmit}>
        {error && <p className="form-error-message error-message">{error}</p>}
        <div>
          <label htmlFor={`objective-title-${projectId || 'new'}`}>Objective Title:</label>
          <input
            type="text"
            id={`objective-title-${projectId || 'new'}`} // Ensure unique ID even if projectId is temp null
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`objective-brief-${projectId || 'new'}`}>Brief/Description:</label>
          <textarea
            id={`objective-brief-${projectId || 'new'}`}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </div>
        <button type="submit">Save Objective</button>
        {onCancel && ( // Conditionally render cancel button
          <button type="button" onClick={onCancel} className="cancel-objective-form-btn">
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}

export default CreateObjectiveForm;
