'use client'; // Add use client for Next.js App Router client components

import React, { useState, useEffect } from 'react';
import axios from 'axios';

function WordPressConfigModal({ project, onClose, onConfigSaved }) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (project) {
      setUrl(project.wordpressUrl || '');
      setUsername(project.wordpressUsername || '');
      setPassword('');
    } else {
      // Reset form if project becomes null (e.g. modal is hidden then shown for new project)
      setUrl('');
      setUsername('');
      setPassword('');
      setError('');
    }
  }, [project]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!url.trim() || !username.trim()) {
      setError('WordPress URL and Username are required.');
      setIsSubmitting(false);
      return;
    }

    // Password validation: required if it's a new connection (no existing project.wordpressUrl)
    // OR if they are trying to save changes and have entered a new password.
    // If project.wordpressUrl exists (editing existing) and password field is blank,
    // it implies they want to keep the existing password.
    if (!password && !project?.wordpressUrl) {
        setError('WordPress Application Password is required for new connections.');
        setIsSubmitting(false);
        return;
    }
    // If they are editing (project.wordpressUrl exists) and they DID NOT type a password,
    // we don't require it here, assuming backend will keep old one if not provided.
    // If they DID type a password while editing, it will be sent.

     try {
      new URL(url);
    } catch (e) {
      setError('Invalid WordPress URL format.');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      wordpressUrl: url,
      wordpressUsername: username,
    };

    if (password) { // Only include password in payload if a new one is entered
        payload.wordpressApplicationPassword = password;
    } else if (!project?.wordpressUrl) {
        // This case should be caught by the earlier password validation for new connections,
        // but as a safeguard, if it's a new connection and password somehow wasn't caught,
        // it's an error.
        setError('WordPress Application Password is required for new connections.');
        setIsSubmitting(false);
        return;
    }
    // If project.wordpressUrl exists and password is empty, wordpressApplicationPassword is NOT sent.
    // The backend PUT /api/projects/:projectId should be designed to only update fields present in the payload.
    // If wordpressApplicationPassword is not sent, it should not change the existing one.
    // If it's sent as null/empty, it should clear it (which is disconnect logic).

    try {
      await axios.put(`/api/projects/${project.id}`, payload);
      if(onConfigSaved) onConfigSaved();
      if(onClose) onClose();
    } catch (err) {
      console.error('Failed to save WordPress config:', err);
      setError(err.response?.data?.error || 'Failed to save configuration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!project || !project.id) return;
    if (window.confirm('Are you sure you want to disconnect WordPress for this project? This will remove stored credentials.')) {
      setIsSubmitting(true);
      setError('');
      try {
        await axios.put(`/api/projects/${project.id}`, {
          wordpressUrl: null,
          wordpressUsername: null,
          wordpressApplicationPassword: null, // Explicitly set to null to clear
        });
        if(onConfigSaved) onConfigSaved();
        if(onClose) onClose();
      } catch (err) {
        console.error('Failed to disconnect WordPress:', err);
        setError(err.response?.data?.error || 'Failed to disconnect.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (!project) return null;

  return (
    <div id="wordpress-config-modal" className="modal" style={{ display: 'block' }}> {/* Assuming parent controls visibility */}
      <div className="modal-content">
        {onClose && <span className="close-button" onClick={onClose}>&times;</span>}
        <h2>WordPress Configuration for {project.name}</h2>
        <form id="wordpress-config-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="modal-wordpress-url">WordPress Site URL:</label>
            <input
              type="url"
              id="modal-wordpress-url"
              placeholder="https://your-wordpress-site.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="modal-wordpress-username">WordPress Username:</label>
            <input
              type="text"
              id="modal-wordpress-username"
              placeholder="Your WordPress username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="modal-wordpress-app-password">WordPress Application Password:</label>
            <input
              type="password"
              id="modal-wordpress-app-password"
              placeholder={project.wordpressApplicationPassword ? 'Leave blank to keep current, or enter new' : 'Enter Application Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              // Conditionally required: only if it's a new connection (no project.wordpressUrl yet)
              required={!project.wordpressUrl}
            />
            <small>
              Use an <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer">Application Password</a>.
            </small>
          </div>
          {error && <div id="wordpress-config-modal-error" className="error-message" style={{ display: 'block', marginTop: '10px' }}>{error}</div>}
          <div className="modal-actions" style={{marginTop: '20px'}}>
            <button type="submit" id="save-wordpress-config-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (project.wordpressUrl ? 'Save Changes' : 'Save Connection')}
            </button>
            {project.wordpressUrl && ( // Show disconnect only if already configured
              <button
                type="button"
                id="disconnect-wordpress-btn"
                onClick={handleDisconnect}
                disabled={isSubmitting}
                style={{ marginLeft: '10px', backgroundColor: '#dc3545' }}>
                {isSubmitting ? 'Disconnecting...' : 'Disconnect WordPress'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default WordPressConfigModal;
