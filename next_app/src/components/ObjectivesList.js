'use client'; // Add use client for Next.js App Router client components

import React from 'react';

function ObjectivesList({ objectives, onSelectObjective, selectedObjectiveId }) {
  if (!objectives || objectives.length === 0) {
    return <p>No objectives yet for this project.</p>;
  }

  return (
    <ul className="nested-objective-list" style={{ display: 'block' /* Consider moving style to CSS if appropriate */ }}>
      {objectives.map(objective => (
        <li
          key={objective.id}
          className={`objective-item ${objective.id === selectedObjectiveId ? 'active-objective' : ''}`}
          onClick={() => onSelectObjective(objective.id)}
        >
          <strong>{objective.title}</strong>
          {objective.brief && (
            <p className="objective-brief">{objective.brief}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default ObjectivesList;
