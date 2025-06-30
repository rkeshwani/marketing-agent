'use client'; // Add use client for Next.js App Router client components

import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ProjectContextModal({ projectId, projectContextAnswers: initialAnswersString, onClose, onAnswersSubmitted }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchContextData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const questionsResponse = await axios.post(`/api/projects/${projectId}/context-questions`);
        const fetchedQuestions = questionsResponse.data || [];
        setQuestions(fetchedQuestions);

        const initialAnswersMap = {};
        if (initialAnswersString) {
            const entries = initialAnswersString.split('\n\n');
            entries.forEach(entry => {
                const qMatch = entry.match(/Q: (.*?)\nA: ([\s\S]*?)(?=(Q:|$))/);
                if (qMatch && qMatch.length >= 3) {
                    initialAnswersMap[qMatch[1].trim()] = qMatch[2].trim();
                }
            });
        }

        const answersInit = {};
        fetchedQuestions.forEach(q => {
            answersInit[q] = initialAnswersMap[q] || '';
        });
        setAnswers(answersInit);

      } catch (err) {
        console.error('Failed to fetch project context questions:', err);
        setError(err.response?.data?.error || 'Failed to load context questions.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchContextData();
  }, [projectId, initialAnswersString]);

  const handleAnswerChange = (question, value) => {
    setAnswers(prev => ({ ...prev, question: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    let userAnswersString = "";
    questions.forEach(q => {
        userAnswersString += `Q: ${q}\nA: ${answers[q] || ''}\n\n`;
    });

    try {
      const response = await axios.post(`/api/projects/${projectId}/context-answers`, {
        userAnswersString: userAnswersString.trim(),
      });
      if(onAnswersSubmitted) { // Ensure callback exists
        onAnswersSubmitted(response.data);
      }
      if(onClose) onClose();
    } catch (err) {
      console.error('Failed to submit context answers:', err);
      setError(err.response?.data?.error || 'Failed to submit answers.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!projectId) return null;

  return (
    <div id="project-context-modal" className="modal" style={{ display: 'block' }}> {/* Assuming parent controls visibility */}
      <div className="modal-content">
        {onClose && <span className="close-button" onClick={onClose}>&times;</span>}
        <h2>Project Context Questions</h2>
        <p>Please answer these questions to help the agent understand your project better.</p>

        {isLoading && <p>Loading context questions...</p>}
        {error && <p className="error-message">{error}</p>}

        {!isLoading && !error && questions.length === 0 && <p>No context questions are defined for this project.</p>}

        {!isLoading && !error && questions.length > 0 && (
          <form id="context-answers-form" onSubmit={handleSubmit}>
            <div id="context-questions-container">
              {questions.map((question, index) => (
                <div key={index} className="context-question-item">
                  <label htmlFor={`context-answer-${index}`}>{question}</label>
                  <textarea
                    id={`context-answer-${index}`}
                    name={`context-answer-${index}`}
                    value={answers[question] || ''}
                    onChange={(e) => handleAnswerChange(question, e.target.value)}
                    rows={3} // Corrected attribute name from "rows" to "rows"
                  />
                </div>
              ))}
            </div>
            <button type="submit" id="submit-context-answers-btn" disabled={isSubmitting} style={{ marginTop: '15px' }}>
              {isSubmitting ? 'Submitting...' : (initialAnswersString && Object.keys(initialAnswersMap).length > 0 ? 'Save Changes' : 'Submit Answers')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ProjectContextModal;
