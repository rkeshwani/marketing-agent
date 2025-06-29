import React, { useState } from 'react';

function CreateProjectForm({ onSubmit, onConnectFacebook, onConnectTiktok, onConnectLinkedin }) {
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [wordpressUrl, setWordpressUrl] = useState('');
  const [wordpressUsername, setWordpressUsername] = useState('');
  const [wordpressAppPassword, setWordpressAppPassword] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    // Basic validation (can be expanded)
    if (!projectName) {
      alert('Project name is required.');
      return;
    }
    onSubmit({
      name: projectName,
      description: projectDescription,
      wordpressUrl,
      wordpressUsername,
      wordpressApplicationPassword: wordpressAppPassword,
    });
    // Reset form fields
    setProjectName('');
    setProjectDescription('');
    setWordpressUrl('');
    setWordpressUsername('');
    setWordpressAppPassword('');
  };

  return (
    <form id="create-project-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="project-name">Project Name:</label>
        <input
          type="text"
          id="project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor="project-description">Description (Optional):</label>
        <textarea
          id="project-description"
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
        />
      </div>
      <div>
        <button type="button" id="connect-facebook-btn" onClick={onConnectFacebook}>Connect to Facebook</button>
      </div>
      <div>
        <button type="button" id="connect-tiktok-btn" onClick={onConnectTiktok}>Connect to TikTok</button>
      </div>
      <div>
        <button type="button" id="connect-linkedin-btn" onClick={onConnectLinkedin}>Connect LinkedIn</button>
      </div>

      <div className="form-divider"></div>
      <h3>WordPress Integration</h3>
      <div>
        <label htmlFor="wordpress-url">WordPress Site URL (e.g., https://myblog.com):</label>
        <input
          type="url"
          id="wordpress-url"
          placeholder="https://your-wordpress-site.com"
          value={wordpressUrl}
          onChange={(e) => setWordpressUrl(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="wordpress-username">WordPress Username:</label>
        <input
          type="text"
          id="wordpress-username"
          placeholder="Your WordPress username"
          value={wordpressUsername}
          onChange={(e) => setWordpressUsername(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="wordpress-app-password">WordPress Application Password:</label>
        <input
          type="password"
          id="wordpress-app-password"
          placeholder="Use an Application Password"
          value={wordpressAppPassword}
          onChange={(e) => setWordpressAppPassword(e.target.value)}
        />
        <small>
          It's highly recommended to use an{' '}
          <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer">
            Application Password
          </a> for security.
        </small>
      </div>
      <div className="form-divider"></div>

      <button type="submit">Create Project</button>
    </form>
  );
}

export default CreateProjectForm;
