import React, { useState } from 'react';

function CreateObjectiveForm({ projectId, onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Objective title is required.');
      return;
    }
    setError('');
    onSubmit({ projectId, title, brief });
    setTitle('');
    setBrief('');
  };

  return (
    <div className="create-objective-form-instance" style={{ display: 'block' }}>
      {/* The H3 might be part of ProjectListItem or passed as a prop if needed */}
      {/* <h3>Create New Objective</h3>  */}
      <form onSubmit={handleSubmit}>
        {error && <p className="form-error-message error-message">{error}</p>}
        <div>
          <label htmlFor={`objective-title-${projectId}`}>Objective Title:</label>
          <input
            type="text"
            id={`objective-title-${projectId}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`objective-brief-${projectId}`}>Brief/Description:</label>
          <textarea
            id={`objective-brief-${projectId}`}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
        </div>
        <button type="submit">Save Objective</button>
        <button type="button" onClick={onCancel} className="cancel-objective-form-btn">
          Cancel
        </button>
      </form>
    </div>
  );
}

export default CreateObjectiveForm;
