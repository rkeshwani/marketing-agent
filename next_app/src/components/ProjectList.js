'use client'; // Add use client for Next.js App Router client components

import React, { useState, useEffect } from 'react';
import ObjectivesList from './ObjectivesList';
import CreateObjectiveForm from './CreateObjectiveForm';

function ProjectListItem({
  project,
  onSelectProject,
  isSelected,
  objectives, // Objectives for THIS project
  isLoadingObjectives,
  objectiveError,
  onSelectObjective,
  selectedObjectiveId,
  onCreateObjective, // Passed down from App
  onManageAssets,
  onEditContext,
  onWordPressConfig
}) {
  const [showObjectivesAndDescription, setShowObjectivesAndDescription] = useState(false);
  const [showCreateObjectiveForm, setShowCreateObjectiveForm] = useState(false);

  useEffect(() => {
    if (isSelected) {
      setShowObjectivesAndDescription(true);
    } else {
      setShowObjectivesAndDescription(false);
      setShowCreateObjectiveForm(false);
    }
  }, [isSelected]);

  const handleProjectClick = () => {
    onSelectProject(project.id);
    if (isSelected) {
      setShowObjectivesAndDescription(!showObjectivesAndDescription);
    }
  };

  const handleAddObjectiveClick = (e) => {
    e.stopPropagation();
    setShowCreateObjectiveForm(true);
  };

  const handleInternalCreateObjective = async (objectiveData) => {
    try {
      await onCreateObjective({ ...objectiveData, projectId: project.id });
      setShowCreateObjectiveForm(false);
    } catch (error) {
      console.error("Error creating objective from ProjectListItem:", error);
    }
  };

  return (
    <li
      className={`project-item ${isSelected && showObjectivesAndDescription ? 'active' : ''}`}
      onClick={handleProjectClick}
    >
      <strong>{project.name}</strong>
      {isSelected && showObjectivesAndDescription && project.description && (
        <p className="project-description">
          {project.description}
        </p>
      )}
      <div className="project-item-actions">
        <button onClick={(e) => { e.stopPropagation(); onManageAssets(project.id, project.name); }}>Manage Assets</button>
        <button onClick={(e) => { e.stopPropagation(); onEditContext(project.id); }}>Edit Context</button>
        <button onClick={handleAddObjectiveClick} disabled={!isSelected}>Add Objective</button>
        <button onClick={(e) => { e.stopPropagation(); onWordPressConfig(project.id); }}>
          {project.wordpressUrl ? 'Manage WordPress' : 'Connect WordPress'}
        </button>
      </div>

      {isSelected && showObjectivesAndDescription && (
        <div className="nested-objective-list">
          {isLoadingObjectives && <p>Loading objectives...</p>}
          {objectiveError && <p className="error-message">{objectiveError}</p>}
          {!isLoadingObjectives && !objectiveError && objectives && (
            <ObjectivesList
              objectives={objectives}
              onSelectObjective={onSelectObjective}
              selectedObjectiveId={selectedObjectiveId}
            />
          )}
          {showCreateObjectiveForm && (
            <CreateObjectiveForm
              projectId={project.id}
              onSubmit={handleInternalCreateObjective}
              onCancel={() => setShowCreateObjectiveForm(false)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function ProjectList({
  projects,
  onSelectProject,
  selectedProjectId,
  objectivesByProjectId,
  isLoadingObjectives,
  objectiveError,
  onSelectObjective,
  selectedObjectiveId,
  onCreateObjective,
  onManageAssets,
  onEditContext,
  onWordPressConfig
}) {
  if (!projects || projects.length === 0) {
    return <p>No projects yet. Create one using the form above!</p>;
  }

  return (
    <ul className="project-list">
      {projects.map(project => (
        <ProjectListItem
          key={project.id}
          project={project}
          onSelectProject={onSelectProject}
          isSelected={project.id === selectedProjectId}
          objectives={objectivesByProjectId[project.id] || []}
          isLoadingObjectives={isLoadingObjectives && project.id === selectedProjectId}
          objectiveError={project.id === selectedProjectId ? objectiveError : null}
          onSelectObjective={onSelectObjective}
          selectedObjectiveId={selectedObjectiveId}
          onCreateObjective={onCreateObjective}
          onManageAssets={onManageAssets}
          onEditContext={onEditContext}
          onWordPressConfig={onWordPressConfig}
        />
      ))}
    </ul>
  );
}

export default ProjectList;
