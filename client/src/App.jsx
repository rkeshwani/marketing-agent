import React, { useState, useEffect } from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import { CopilotSidebar } from "@copilotkit/react-ui";
import axios from 'axios';
import ProjectList from './components/ProjectList';
import CreateProjectForm from './components/CreateProjectForm';
import ChatSection from './components/ChatSection';
import AssetsSection from './components/AssetsSection';
import ProjectContextModal from './components/ProjectContextModal';
import WordPressConfigModal from './components/WordPressConfigModal';

function App() {
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState(null);
  const [isCreateProjectFormVisible, setIsCreateProjectFormVisible] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [objectivesByProjectId, setObjectivesByProjectId] = useState({});
  const [isLoadingObjectives, setIsLoadingObjectives] = useState(false);
  const [objectiveError, setObjectiveError] = useState(null);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(null);

  const [showAssetsView, setShowAssetsView] = useState(false);
  const [currentProjectForAssets, setCurrentProjectForAssets] = useState(null);

  const [showContextModal, setShowContextModal] = useState(false);
  const [currentProjectForContext, setCurrentProjectForContext] = useState(null);

  const [showWordPressModal, setShowWordPressModal] = useState(false);
  const [currentProjectForWordPress, setCurrentProjectForWordPress] = useState(null);


  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    setProjectError(null);
    try {
      const response = await axios.get('/api/projects');
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjectError(error.message || 'Failed to load projects.');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProjectSubmit = async (projectData) => {
    try {
      const { wordpressUrl, wordpressUsername, wordpressApplicationPassword } = projectData;
      if (wordpressUrl || wordpressUsername || wordpressApplicationPassword) {
        if (!wordpressUrl || !wordpressUsername || !wordpressApplicationPassword) {
          alert('To configure WordPress, please provide URL, Username, and Application Password.');
          return;
        }
        try { new URL(wordpressUrl); } catch (e) { alert('Invalid WordPress URL format.'); return; }
      }

      const response = await axios.post('/api/projects', projectData);
      await fetchProjects(); // Ensure projects list is updated before accessing the new project
      setIsCreateProjectFormVisible(false);
      alert('Project created successfully!');

      const newProject = projects.find(p => p.id === response.data.id) || response.data;
      if (newProject && newProject.id) {
        setCurrentProjectForContext({ id: newProject.id, projectContextAnswers: newProject.projectContextAnswers || '' });
        setShowContextModal(true);
        // Ensure other views are hidden
        setShowAssetsView(false);
        setSelectedObjectiveId(null);
        setShowWordPressModal(false);
      }

    } catch (error) {
      console.error('Failed to create project:', error);
      alert(`Failed to create project: ${error.response?.data?.error || error.message}`);
    }
  };

  const toggleCreateProjectForm = () => {
    setIsCreateProjectFormVisible(!isCreateProjectFormVisible);
  };

  // Note: For these social connection handlers, if the project is being created
  // (i.e., name/description are typed in CreateProjectForm but not yet submitted),
  // we don't have direct access to that form's state here in App.jsx.
  // The original app.js read directly from DOM input fields.
  // A more React-idiomatic way if connecting *during* creation would be to lift
  // projectName and projectDescription state from CreateProjectForm to App.jsx,
  // or pass a callback to CreateProjectForm to get these values.
  // For now, these will just redirect. If project details are needed by the auth flow
  // *before* project creation, this part would need refinement.
  // The original app.js used sessionStorage for this, which we can replicate if needed.

  const handleConnectFacebook = () => {
    // Assuming project name/desc from form are not strictly needed for the *initial* redirect.
    // If they ARE needed by the backend at the start of auth, this needs adjustment.
    // For now, let's replicate the sessionStorage part as it was in the original.
    // This implies CreateProjectForm should ideally write to sessionStorage if these buttons are clicked.
    // However, CreateProjectForm is a separate component.
    // A simpler immediate step is just the redirect.
    // If backend needs project details from sessionStorage, CreateProjectForm must set them.
    // Let's assume for now the backend handles it or it's post-auth.
    // To fully replicate:
    // const name = document.getElementById('project-name')?.value; // Not ideal in React
    // const description = document.getElementById('project-description')?.value;
    // if (name) sessionStorage.setItem('pendingProjectName', name);
    // if (description) sessionStorage.setItem('pendingProjectDescription', description);
    window.location.href = '/auth/facebook';
  };

  const handleConnectTiktok = () => {
    // Similar sessionStorage logic could apply here if needed by backend.
    window.location.href = '/auth/tiktok';
  };

  const handleConnectLinkedin = () => {
    // Similar sessionStorage logic could apply here if needed by backend.
    window.location.href = '/auth/linkedin';
  };

  const fetchObjectivesForProject = async (projectId) => {
    if (!projectId) return;
    setIsLoadingObjectives(true);
    setObjectiveError(null);
    try {
      const response = await axios.get(`/api/projects/${projectId}/objectives`);
      setObjectivesByProjectId(prev => ({ ...prev, [projectId]: response.data }));
    } catch (error) {
      console.error(`Failed to fetch objectives for project ${projectId}:`, error);
      setObjectiveError(error.message || `Failed to load objectives for project ${projectId}.`);
      setObjectivesByProjectId(prev => ({ ...prev, [projectId]: [] }));
    } finally {
      setIsLoadingObjectives(false);
    }
  };

  const clearMainContentViews = () => {
    setSelectedObjectiveId(null);
    setShowAssetsView(false);
    setShowContextModal(false);
    setShowWordPressModal(false);
  };

  const handleSelectProject = (projectId) => {
    setSelectedProjectId(projectId);
    clearMainContentViews();
    if (projectId && !objectivesByProjectId[projectId]) {
      fetchObjectivesForProject(projectId);
    }
  };

  const handleSelectObjective = (objectiveId) => {
    clearMainContentViews();
    setSelectedObjectiveId(objectiveId);
  };

  const handleBackToObjectives = () => {
    setSelectedObjectiveId(null);
  };

  const handleCreateObjective = async (objectiveData) => {
    const { projectId, title, brief } = objectiveData;
    if (!projectId || !title) { alert("Project ID and Objective title are required."); return; }
    try {
      const response = await axios.post(`/api/projects/${projectId}/objectives`, { title, brief });
      fetchObjectivesForProject(projectId);
      alert('Objective created successfully!');
      return response.data;
    } catch (error) {
      console.error('Failed to create objective:', error);
      alert(`Failed to create objective: ${error.response?.data?.error || error.message}`);
      throw error;
    }
  };

  const handleManageAssets = (projectId, projectName) => {
    clearMainContentViews();
    setCurrentProjectForAssets({ id: projectId, name: projectName });
    setShowAssetsView(true);
  };

  const handleHideAssets = () => {
    setShowAssetsView(false);
    setCurrentProjectForAssets(null);
  };

  const handleEditContext = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      clearMainContentViews();
      setCurrentProjectForContext({ id: project.id, projectContextAnswers: project.projectContextAnswers || '' });
      setShowContextModal(true);
    } else {
      alert('Project not found.');
    }
  };

  const handleCloseContextModal = () => {
    setShowContextModal(false);
    setCurrentProjectForContext(null);
  };

  const handleContextAnswersSubmitted = (/*responseData*/) => {
    alert('Project context updated successfully!');
    fetchProjects();
    handleCloseContextModal();
  };

  const handleWordPressConfig = (projectId) => {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      clearMainContentViews();
      setCurrentProjectForWordPress(project);
      setShowWordPressModal(true);
    } else {
      alert('Project not found for WordPress config.');
    }
  };

  const handleCloseWordPressModal = () => {
    setShowWordPressModal(false);
    setCurrentProjectForWordPress(null);
  };

  const handleWordPressConfigSaved = () => {
    alert('WordPress configuration saved!');
    fetchProjects(); // Re-fetch projects to get updated WP details
    handleCloseWordPressModal();
  };


  return (
    <CopilotKit
      runtimeUrl="/api/agent/"
      // Attempt to send selectedObjectiveId with each request to the runtime
      // This allows the backend to know the context of the conversation.
      body={{
        objectiveId: selectedObjectiveId // Will be null if no objective is selected
      }}
      // Alternatively, could use headers:
      // headers={{
      //   'X-Objective-ID': selectedObjectiveId || ''
      // }}
    >
      <div id="app-container">
        <header><h1>Marketing Agent Platform</h1></header>
        <main>
        <div id="app-layout">
          <aside id="sidebar">
            <div id="projects-section">
              <h2>Projects</h2>
              <div id="project-list-container">
                {isLoadingProjects && <p>Loading projects...</p>}
                {projectError && <p className="error-message">{projectError}</p>}
                {!isLoadingProjects && !projectError && (
                  <ProjectList
                    projects={projects}
                    onSelectProject={handleSelectProject}
                    selectedProjectId={selectedProjectId}
                    objectivesByProjectId={objectivesByProjectId}
                    isLoadingObjectives={isLoadingObjectives}
                    objectiveError={objectiveError}
                    onSelectObjective={handleSelectObjective}
                    selectedObjectiveId={selectedObjectiveId}
                    onCreateObjective={handleCreateObjective}
                    onManageAssets={handleManageAssets}
                    onEditContext={handleEditContext}
                    onWordPressConfig={handleWordPressConfig}
                  />
                )}
              </div>
              <h3
                className={`form-toggle-header ${isCreateProjectFormVisible ? 'active' : ''}`}
                onClick={toggleCreateProjectForm}
              >
                Create New Project
              </h3>
              {isCreateProjectFormVisible && (
                <div id="create-project-form-container" className="active">
                  <CreateProjectForm
                    onSubmit={handleCreateProjectSubmit}
                    onConnectFacebook={handleConnectFacebook}
                    onConnectTiktok={handleConnectTiktok}
                    onConnectLinkedin={handleConnectLinkedin}
                  />
                </div>
              )}
            </div>
          </aside>

          <section id="main-content">
            {showWordPressModal && currentProjectForWordPress ? (
              <WordPressConfigModal
                project={currentProjectForWordPress}
                onClose={handleCloseWordPressModal}
                onConfigSaved={handleWordPressConfigSaved}
              />
            ) : showContextModal && currentProjectForContext ? (
              <ProjectContextModal
                projectId={currentProjectForContext.id}
                projectContextAnswers={currentProjectForContext.projectContextAnswers}
                onClose={handleCloseContextModal}
                onAnswersSubmitted={handleContextAnswersSubmitted}
              />
            ) : showAssetsView && currentProjectForAssets ? (
              <AssetsSection
                projectId={currentProjectForAssets.id}
                projectName={currentProjectForAssets.name}
                onBackToProjects={handleHideAssets}
              />
            ) : selectedObjectiveId ? (
              <ChatSection
                selectedObjective={
                  objectivesByProjectId[selectedProjectId]?.find(obj => obj.id === selectedObjectiveId) || null
                }
                onBackToObjectives={handleBackToObjectives}
              />
            ) : (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>Main Content Area</h2>
                <p>Select a project, then an objective to start chatting, manage assets, or edit project context.</p>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer><p>&copy; 2024 Marketing Agent Co.</p></footer>
      {/* Default CopilotKit Sidebar - can be customized or replaced */}
      <CopilotSidebar
        labels={{
            title: "Marketing Copilot",
            initial: "Hi there! How can I help you with your marketing objective?"
        }}
        defaultOpen={true}
        clickOutsideToClose={false}
       />
    </div>
    </CopilotKit>
  );
}

export default App;
