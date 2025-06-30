'use client';

'use client';

import React, { useState, useEffect } from 'react';
import { CopilotContextParams } from '@copilotkit/react-core'; // Import for context
import axios from 'axios';
import ProjectList from './ProjectList';
import CreateProjectForm from './CreateProjectForm';
import ChatSection from './ChatSection';
import AssetsSection from './AssetsSection';
import ProjectContextModal from './ProjectContextModal';
import WordPressConfigModal from './WordPressConfigModal';
import { useCopilotReadable } // For later, to pass objectiveId to CopilotKit context if needed

// Note: The CopilotKit provider and CopilotSidebar are now in layout.js
// We might need a way to update the CopilotKit provider's `body` prop (for objectiveId)
// from this client component. This might involve a shared context or a different approach.
// For now, CopilotKit in layout.js won't have dynamic objectiveId from here directly.
// This will be addressed in the "Integrate CopilotKit Frontend" step.

function MainPage() {
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

  // CopilotKit related state - this is a placeholder for how we might update context
  // const { setCopilotRequestBody } = useCopilotContext(); // Hypothetical hook - CopilotContextParams is declarative

  // useEffect(() => {
    // This useEffect was for a hypothetical imperative context update.
    // With CopilotContextParams, it's declarative, placed in the JSX.
  // }, [selectedObjectiveId]);


  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    setProjectError(null);
    try {
      // These API calls still point to the original backend's /api routes.
      // If these routes are moved to Next.js API routes, paths might change slightly (e.g. no /api prefix if not desired)
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
      // Fetch projects again to get the full list with the new project
      // Need to find the new project in the updated list to get its full data for context modal
      const newProjectData = response.data; // Assuming backend returns the created project
      await fetchProjects();
      setIsCreateProjectFormVisible(false);
      alert('Project created successfully!');

      if (newProjectData && newProjectData.id) {
        // We need to ensure `projects` state is updated from fetchProjects before finding
        // This might require awaiting fetchProjects or finding from response.data directly
        // For simplicity, let's assume response.data has enough info or we re-fetch and then find.
        // To be robust, one might pass the newProjectData directly or ensure fetchProjects completes and updates state.
        setCurrentProjectForContext({ id: newProjectData.id, projectContextAnswers: newProjectData.projectContextAnswers || '' });
        setShowContextModal(true);
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

  const handleConnectFacebook = () => { window.location.href = '/auth/facebook'; };
  const handleConnectTiktok = () => { window.location.href = '/auth/tiktok'; };
  const handleConnectLinkedin = () => { window.location.href = '/auth/linkedin'; };

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
    if (!projectId || !title) { alert("Project ID and Objective title are required."); return Promise.reject(new Error("Project ID and Title required")); }
    try {
      const response = await axios.post(`/api/projects/${projectId}/objectives`, { title, brief });
      fetchObjectivesForProject(projectId); // Refresh objectives for this project
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
    fetchProjects();
    handleCloseWordPressModal();
  };

  // Determine current project for modals if only ID is stored for selection
  const fullSelectedProjectForWordPress = projects.find(p => p.id === currentProjectForWordPress?.id) || currentProjectForWordPress;


  return (
    <> {/* Use fragment to wrap CopilotContextParams and the layout div */}
      <CopilotContextParams
        key={selectedObjectiveId} // Re-render context if objectiveId changes, ensuring new context is picked up
        context={{ // This context is merged with the CopilotKit provider's context/body
          objectiveId: selectedObjectiveId
        }}
      />
      <div id="app-layout"> {/* This was the main layout container in old App.jsx's main tag */}
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
        {showWordPressModal && fullSelectedProjectForWordPress ? (
          <WordPressConfigModal
            project={fullSelectedProjectForWordPress}
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
  );
}

export default MainPage;
