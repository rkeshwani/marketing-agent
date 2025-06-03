// public/app.js
document.addEventListener('DOMContentLoaded', () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
                .catch(error => console.log('ServiceWorker registration failed: ', error));
        });
    }

    // --- DOM Elements ---
    const projectListContainer = document.getElementById('project-list-container');
    const createProjectForm = document.getElementById('create-project-form');
    const projectNameInput = document.getElementById('project-name');
    const projectDescriptionInput = document.getElementById('project-description');
    const selectedProjectNameElement = document.getElementById('selected-project-name');
    // New buttons for social media connection
    const connectFacebookBtn = document.getElementById('connect-facebook-btn');
    const connectTiktokBtn = document.getElementById('connect-tiktok-btn');

    const objectiveListContainer = document.getElementById('objective-list-container');
    const createObjectiveForm = document.getElementById('create-objective-form');
    const objectiveTitleInput = document.getElementById('objective-title');
    const objectiveBriefInput = document.getElementById('objective-brief');
    const backToProjectsButton = document.getElementById('back-to-projects-button');
    const selectedObjectiveTitleElement = document.getElementById('selected-objective-title');
    const backToObjectivesButton = document.getElementById('back-to-objectives-button');

    const projectsSection = document.getElementById('projects-section');
    const objectivesSection = document.getElementById('objectives-section');
    const chatSection = document.getElementById('chat-section');

    const userInputElement = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatOutput = document.getElementById('chat-output');
    const chatInputArea = document.getElementById('chat-input-area'); // Added

    // Plan Display Elements
    const planDisplaySection = document.getElementById('plan-display-section');
    const planStatusMessage = document.getElementById('plan-status-message');
    const planStepsList = document.getElementById('plan-steps-list');
    const planQuestionsArea = document.getElementById('plan-questions-area');
    const planQuestionsList = document.getElementById('plan-questions-list');
    const planActions = document.getElementById('plan-actions');
    const approvePlanBtn = document.getElementById('approve-plan-btn');
    // const rejectPlanBtn = document.getElementById('reject-plan-btn'); // If added

    // Asset Management DOM Elements
    const assetsSection = document.getElementById('assets-section');
    const selectedProjectNameForAssetsElement = document.getElementById('selected-project-name-for-assets');
    const uploadAssetForm = document.getElementById('upload-asset-form');
    const assetFileInput = document.getElementById('asset-file-input');
    const assetListContainer = document.getElementById('asset-list-container');
    const uploadStatusMessage = document.getElementById('upload-status-message');
    const backToProjectsFromAssetsButton = document.getElementById('back-to-projects-from-assets-button');

    // Project Context Modal Elements
    const projectContextModal = document.getElementById('project-context-modal');
    const contextQuestionsContainer = document.getElementById('context-questions-container');
    const submitContextAnswersBtn = document.getElementById('submit-context-answers-btn');
    const closeContextModalBtn = document.getElementById('close-context-modal-btn'); // Optional, ensure it exists in HTML
    const contextAnswersForm = document.getElementById('context-answers-form'); // Ensure this form wraps questions and submit button


    // --- State ---
    let projects = [];
    let objectives = [];
    let currentChatHistory = []; // Stores history for the currently selected objective
    let selectedProjectId = null;
    let selectedObjectiveId = null;

    // --- Utility Functions ---
    function displayError(message, container = null, isGeneral = false) {
        console.error(message);
        if (isGeneral || !container) {
            alert(`Error: ${message}`);
            return;
        }
        const errorElement = document.createElement('p');
        errorElement.classList.add('error-message');
        errorElement.textContent = message;
        clearContainer(container, '.error-message');
        container.appendChild(errorElement);
    }

    function clearContainer(container, selectorToRemove = null) {
        if (container) {
            if (selectorToRemove) {
                const elementsToRemove = container.querySelectorAll(selectorToRemove);
                elementsToRemove.forEach(el => el.remove());
            } else {
                container.innerHTML = '';
            }
        }
    }

    // --- UI Section Management ---
    function showProjectsSection() {
        projectsSection.style.display = 'block';
        objectivesSection.style.display = 'none';
        chatSection.style.display = 'none';
        if (assetsSection) assetsSection.style.display = 'none'; // Hide assets section
        if (projectContextModal) projectContextModal.style.display = 'none'; // Hide context modal
        selectedProjectId = null;
        selectedObjectiveId = null;
        objectives = [];
        currentChatHistory = [];
        clearContainer(objectiveListContainer);
        clearContainer(chatOutput);
        if (createObjectiveForm) createObjectiveForm.reset();
        if (createProjectForm) createProjectForm.reset(); // Also reset project form
        clearContainer(createProjectForm, '.error-message'); // Clear errors on project form
    }

    function showObjectivesSection() {
        projectsSection.style.display = 'none';
        objectivesSection.style.display = 'block';
        chatSection.style.display = 'none';
        if (assetsSection) assetsSection.style.display = 'none'; // Hide assets section
        selectedObjectiveId = null;
        currentChatHistory = [];
        clearContainer(chatOutput);
        if (createObjectiveForm) createObjectiveForm.reset();
        clearContainer(createObjectiveForm, '.error-message'); // Clear errors on objective form

        if (selectedProjectId) {
            const currentProject = projects.find(p => p.id === selectedProjectId);
            selectedProjectNameElement.textContent = currentProject ? currentProject.name : "Selected Project";
            fetchObjectives(selectedProjectId);
        } else {
            displayError("No project selected. Please go back and select a project.", objectiveListContainer, true);
            showProjectsSection(); // Redirect if no project ID
        }
    }

    async function showChatSection() {
        projectsSection.style.display = 'none';
        objectivesSection.style.display = 'none';
        chatSection.style.display = 'block';
        if (assetsSection) assetsSection.style.display = 'none'; // Hide assets section
        userInputElement.value = ''; // Clear input field
        clearContainer(chatOutput); // Clear previous chat messages before showing section
        planDisplaySection.style.display = 'none'; // Initially hide plan
        chatInputArea.style.display = 'none'; // Initially hide chat input

        if (selectedObjectiveId) {
            const objective = objectives.find(o => o.id === selectedObjectiveId);
            selectedObjectiveTitleElement.textContent = objective ? objective.title : "Objective";
            // Fetch and display plan will handle chat history fetching and UI visibility
            await fetchAndDisplayPlan(selectedObjectiveId);
        } else {
            displayError("No objective selected for chat.", chatOutput, true);
            showObjectivesSection(); // Redirect if no objective ID
        }
    }

    // --- Plan Functions ---
    function renderPlan(plan) {
        if (!planDisplaySection || !planStepsList || !planQuestionsList || !planStatusMessage || !approvePlanBtn || !chatInputArea || !planQuestionsArea) {
            console.error("Plan display elements not found in DOM during renderPlan.");
            return;
        }

        clearContainer(planStepsList);
        clearContainer(planQuestionsList);

        plan.steps = plan.steps || [];
        plan.questions = plan.questions || [];
        plan.currentStepIndex = plan.currentStepIndex === undefined ? 0 : Number(plan.currentStepIndex); // Ensure it's a number, default to 0

        // First, clear any existing current/completed classes from all items
        // This is a bit inefficient if done here, better to do it before applying new ones.
        // Moved this logic to be more targeted below.

        plan.steps.forEach((step, index) => {
            const li = document.createElement('li');
            li.textContent = step;
            li.id = `plan-step-${index}`; // Assign unique ID
            li.classList.add('plan-step-item'); // Add common class
            planStepsList.appendChild(li);
        });

        // Apply highlighting based on status and currentStepIndex
        const allStepItems = planStepsList.querySelectorAll('.plan-step-item');
        allStepItems.forEach(item => {
            item.classList.remove('current-step', 'completed-step');
        });

        if (plan.status === 'in_progress') {
            for (let i = 0; i < plan.currentStepIndex; i++) { // Steps before current are completed
                const stepLi = document.getElementById(`plan-step-${i}`);
                if (stepLi) stepLi.classList.add('completed-step');
            }
            // Current step to be executed (currentStepIndex is 0-based index of the NEXT step)
            // So, if currentStepIndex is 0, it means step 0 is the current one.
            // If currentStepIndex is 1, step 0 is done, step 1 is current.
            const currentHighlightIndex = plan.currentStepIndex; // The step that is now current
            if (currentHighlightIndex < plan.steps.length) {
                 const currentStepLi = document.getElementById(`plan-step-${currentHighlightIndex}`);
                 if (currentStepLi) currentStepLi.classList.add('current-step');
            }
            planStatusMessage.textContent = 'Plan execution in progress.';
            approvePlanBtn.style.display = 'none';
            chatInputArea.style.display = 'flex'; // Keep chat active

        } else if (plan.status === 'completed') {
            allStepItems.forEach(item => {
                item.classList.add('completed-step');
                item.classList.remove('current-step'); // Ensure no current-step if completed
            });
            planStatusMessage.textContent = 'Plan completed successfully!';
            approvePlanBtn.style.display = 'none';
            // Optionally, disable or change chat input
            // userInputElement.placeholder = "All plan steps completed.";
            // userInputElement.disabled = true;
            // sendButton.disabled = true;
            chatInputArea.style.display = 'flex'; // Or hide it: chatInputArea.style.display = 'none';
        }


        if (plan.questions.length > 0) {
            plan.questions.forEach(question => {
                const li = document.createElement('li');
                li.textContent = question;
                planQuestionsList.appendChild(li);
            });
            planQuestionsArea.style.display = 'block';
        } else {
            planQuestionsArea.style.display = 'none';
        }

        approvePlanBtn.disabled = false; // Default to enabled unless changed

        if (plan.status === 'pending_approval') {
            planStatusMessage.textContent = 'This plan is awaiting your approval.';
            approvePlanBtn.style.display = 'inline-block';
            chatInputArea.style.display = 'none';
            planDisplaySection.style.display = 'block';
            clearContainer(chatOutput); // Clear any "loading chat" messages if plan is pending
            addMessageToUI('agent', "Please review the proposed plan above. Approve it to start working on this objective.");
        } else if (plan.status === 'approved') {
            planStatusMessage.textContent = 'Plan approved! Ready to start or continue.';
            approvePlanBtn.style.display = 'none';
            chatInputArea.style.display = 'flex';
            planDisplaySection.style.display = 'block';
            fetchChatHistory(selectedObjectiveId); // Load chat history for approved plan
            // Highlighting for 'approved' status (likely first step is current if index is 0)
            // This is now handled by the 'in_progress' logic if currentStepIndex > 0,
            // or first step highlighted if currentStepIndex is 0 and status becomes 'in_progress' upon first action.
            // If plan is just 'approved' and currentStepIndex is 0, renderPlan will highlight step 0 if we treat 'approved' as 'in_progress' visually for step 0.
            // For simplicity, let's assume 'approved' means step 0 is about to be current or is current.
            // The following logic is slightly redundant due to the generic 'in_progress' handling but ensures step 0 is highlighted if index is 0.
            const allStepItems = planStepsList.querySelectorAll('.plan-step-item');
            allStepItems.forEach(item => item.classList.remove('current-step', 'completed-step')); // Clear previous
            if (plan.currentStepIndex < plan.steps.length) {
                 const currentStepLi = document.getElementById(`plan-step-${plan.currentStepIndex}`);
                 if (currentStepLi) currentStepLi.classList.add('current-step');
            }

        } else { // No plan, or other statuses not explicitly handled for display (e.g. 'user_modified', 'error')
            planStatusMessage.textContent = 'Plan status: ' + (plan.status || 'Not available');
            planDisplaySection.style.display = 'block'; // Still show plan section for consistency
            chatInputArea.style.display = 'none'; // Hide chat if plan status is not conducive
            approvePlanBtn.style.display = 'none'; // Hide approve button for other statuses
            if (!plan.status && selectedObjectiveId) {
                 addMessageToUI('agent', "No plan information or status. Attempting to initialize...");
            }
        }
    }

    async function fetchAndDisplayPlan(objectiveId) {
        if (!objectiveId) {
            planDisplaySection.style.display = 'none';
            chatInputArea.style.display = 'none';
            addMessageToUI('agent', 'Cannot display plan: Objective ID is missing.');
            return;
        }
        addMessageToUI('agent', 'Loading objective details and plan...'); // Indicate loading
        try {
            const objectiveResponse = await fetch(`/api/objectives/${objectiveId}`);
            if (!objectiveResponse.ok) {
                if (objectiveResponse.status === 404) {
                    addMessageToUI('agent', 'Objective not found. Cannot retrieve or initialize plan.');
                    planDisplaySection.style.display = 'none';
                    chatInputArea.style.display = 'none';
                    return;
                }
                throw new Error(`Failed to fetch objective details: ${objectiveResponse.statusText}`);
            }
            const objectiveData = await objectiveResponse.json();
            clearContainer(chatOutput); // Clear "Loading..." message

            // Update local objectives array
            const objectiveIndex = objectives.findIndex(o => o.id === objectiveId);
            if (objectiveIndex !== -1) {
                objectives[objectiveIndex] = { ...objectives[objectiveIndex], ...objectiveData };
            } else {
                objectives.push(objectiveData); // Should ideally exist if we clicked on it
            }

            const currentObjective = objectives[objectiveIndex !== -1 ? objectiveIndex : objectives.length -1];


            if (currentObjective && currentObjective.plan) {
                // Check if plan needs initialization based on status or content
                if (currentObjective.plan.status === 'pending_approval' ||
                    currentObjective.plan.status === 'approved' ||
                    currentObjective.plan.status === 'in_progress' ||
                    currentObjective.plan.status === 'completed') {
                    renderPlan(currentObjective.plan);
                    if (currentObjective.plan.status === 'approved' || currentObjective.plan.status === 'in_progress') {
                        fetchChatHistory(objectiveId); // Also fetch chat history
                    } else if (currentObjective.plan.status === 'pending_approval') {
                         addMessageToUI('agent', "Please review the proposed plan above. Approve it to start working on this objective.");
                    }
                } else if (!currentObjective.plan.steps || currentObjective.plan.steps.length === 0) {
                    addMessageToUI('agent', 'Plan is empty or status is unclear. Attempting to initialize...');
                    const initResponse = await fetch(`/api/objectives/${objectiveId}/initialize-agent`, { method: 'POST' });
                    if (!initResponse.ok) throw new Error(`Failed to initialize plan: ${initResponse.statusText}`);
                    const newObjectiveData = await initResponse.json();

                    // Update local objective with new plan
                    if (objectiveIndex !== -1) objectives[objectiveIndex] = newObjectiveData; else objectives[objectives.length-1] = newObjectiveData;
                    renderPlan(newObjectiveData.plan);
                    if (newObjectiveData.plan.status === 'pending_approval') {
                         addMessageToUI('agent', "Please review the newly initialized plan.");
                    }
                } else {
                    // Plan exists but status is not one we explicitly handle for special UI changes (e.g. might be user modified)
                    renderPlan(currentObjective.plan);
                     fetchChatHistory(objectiveId); // Fetch chat for other valid plan states
                }
            } else {
                addMessageToUI('agent', 'No plan found. Attempting to initialize a new plan...');
                const initResponse = await fetch(`/api/objectives/${objectiveId}/initialize-agent`, { method: 'POST' });
                if (!initResponse.ok) throw new Error(`Failed to initialize plan: ${initResponse.statusText}`);
                const newObjectiveData = await initResponse.json();

                if (objectiveIndex !== -1) objectives[objectiveIndex] = newObjectiveData; else objectives[objectives.length-1] = newObjectiveData;
                renderPlan(newObjectiveData.plan);
                if (newObjectiveData.plan.status === 'pending_approval') {
                    addMessageToUI('agent', "Please review the newly initialized plan.");
                }
            }
        } catch (error) {
            console.error('Error in fetchAndDisplayPlan:', error);
            clearContainer(chatOutput); // Clear "Loading..."
            const errorDisplayArea = planDisplaySection.style.display === 'none' ? chatOutput : planStatusMessage;
            if (errorDisplayArea) displayError(error.message, errorDisplayArea); else addMessageToUI('agent', error.message);

            if(planDisplaySection) planDisplaySection.style.display = 'block';
            if(planStatusMessage) planStatusMessage.textContent = `Error: ${error.message}`;
            if(chatInputArea) chatInputArea.style.display = 'none';
            if(approvePlanBtn) approvePlanBtn.style.display = 'none';
            addMessageToUI('agent', `Could not load or initialize a plan: ${error.message}`);
        }
    }

    // --- Project Functions ---
    async function fetchProjects() {
        try {
            clearContainer(projectListContainer, '.error-message');
            projectListContainer.innerHTML = '<p>Loading projects...</p>';
            const response = await fetch('/api/projects');
            if (!response.ok) throw new Error(`Failed to fetch projects: ${response.statusText} (${response.status})`);
            projects = await response.json();
            renderProjects();
        } catch (error) {
            displayError(error.message, projectListContainer);
        }
    }

    function renderProjects() {
        clearContainer(projectListContainer);
        if (projects.length === 0) {
            projectListContainer.innerHTML = '<p>No projects yet. Create one below!</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.classList.add('project-list');
        projects.forEach(project => {
            const li = document.createElement('li');
            li.classList.add('project-item');
            li.innerHTML = `<strong>${project.name}</strong>`;
            li.dataset.projectId = project.id;
            if (project.description) {
                const descP = document.createElement('p');
                descP.classList.add('project-description');
                descP.textContent = project.description;
                li.appendChild(descP);
            }
            li.addEventListener('click', () => {
                selectedProjectId = project.id;
                showObjectivesSection();
            });

            // Google Drive Connect Button / Status
            if (project.googleDriveFolderId) {
                const gDriveStatus = document.createElement('p');
                gDriveStatus.classList.add('gdrive-connected-status');
                gDriveStatus.textContent = 'Google Drive Connected';
                li.appendChild(gDriveStatus);
            } else {
                const connectGDriveBtn = document.createElement('button');
                connectGDriveBtn.textContent = 'Connect Google Drive';
                connectGDriveBtn.classList.add('connect-gdrive-btn');
                connectGDriveBtn.dataset.projectId = project.id;
                li.appendChild(connectGDriveBtn);
            }

            // Manage Assets Button
            const manageAssetsBtn = document.createElement('button');
            manageAssetsBtn.textContent = 'Manage Assets';
            manageAssetsBtn.classList.add('manage-assets-btn');
            manageAssetsBtn.dataset.projectId = project.id;
            manageAssetsBtn.dataset.projectName = project.name;
            li.appendChild(manageAssetsBtn);

            ul.appendChild(li);
        });
        projectListContainer.appendChild(ul);

        // Delegated event listeners for project list buttons
        ul.addEventListener('click', function(event) {
            if (event.target.classList.contains('connect-gdrive-btn')) {
                const projectId = event.target.dataset.projectId;
                // Potentially store pending project info if needed, but for GDrive connect,
                // projectId is the main piece of info for the backend.
                window.location.href = `/auth/google/initiate?projectId=${projectId}`;
            } else if (event.target.classList.contains('manage-assets-btn')) {
                selectedProjectId = event.target.dataset.projectId;
                if (selectedProjectNameForAssetsElement) {
                    selectedProjectNameForAssetsElement.textContent = event.target.dataset.projectName;
                }
                showAssetsSection();
            }
            // Note: The direct li click for objectives is still handled by the listener attached to each li individually.
        });
    }

    async function handleCreateProjectSubmit(event) {
        event.preventDefault();
        clearContainer(createProjectForm, '.error-message');
        const name = projectNameInput.value.trim();
        const description = projectDescriptionInput.value.trim();
        if (!name) {
            displayError('Project name is required.', createProjectForm);
            return;
        }
        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to create project' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            const newProject = await response.json(); // Assuming server returns the created project
            await fetchProjects(); // Refresh the list which also updates the `projects` array
            projectNameInput.value = '';
            projectDescriptionInput.value = '';

            // Start project context workflow
            if (newProject && newProject.id) {
                startProjectContextWorkflow(newProject.id);
            } else {
                // Fallback: try to find it in the refreshed list if server didn't return it directly
                // This is less reliable, assumes name is unique and was just added
                const foundProject = projects.find(p => p.name === name && p.description === description);
                if (foundProject) {
                    startProjectContextWorkflow(foundProject.id);
                } else {
                    console.warn('Could not determine new project ID to start context workflow.');
                }
            }

        } catch (error) {
            displayError(error.message, createProjectForm);
        }
    }

    // --- Project Context Workflow Functions ---
    async function startProjectContextWorkflow(projectId) {
        if (!projectContextModal || !contextQuestionsContainer || !submitContextAnswersBtn) {
            console.error('Project context modal elements not found.');
            return;
        }

        clearContainer(contextQuestionsContainer);
        contextQuestionsContainer.innerHTML = '<p>Loading context questions...</p>';
        projectContextModal.style.display = 'block';
        submitContextAnswersBtn.style.display = 'none'; // Hide until questions are loaded

        try {
            const response = await fetch(`/api/projects/${projectId}/context-questions`, { method: 'POST' });
            if (!response.ok) {
                const errData = await response.json().catch(() => ({error: `Failed to fetch context questions: ${response.statusText}`}));
                throw new Error(errData.error);
            }
            const questions = await response.json();

            clearContainer(contextQuestionsContainer);
            if (!questions || questions.length === 0) {
                contextQuestionsContainer.innerHTML = '<p>No context questions were generated for this project. You can close this window.</p>';
                // Optionally hide submit button if no questions, or allow submitting empty answers?
                // For now, let's assume if no questions, workflow ends.
                submitContextAnswersBtn.style.display = 'none';
                return;
            }

            questions.forEach((question, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.classList.add('context-question-item');

                const label = document.createElement('label');
                label.setAttribute('for', `context-answer-${index}`);
                label.textContent = question;

                const textarea = document.createElement('textarea');
                textarea.id = `context-answer-${index}`;
                textarea.name = `context-answer-${index}`;
                textarea.rows = 3;
                textarea.setAttribute('data-question', question); // Store the question itself

                questionDiv.appendChild(label);
                questionDiv.appendChild(textarea);
                if (contextAnswersForm) { // If form element is used
                    contextAnswersForm.appendChild(questionDiv);
                } else { // Fallback to container if no form
                    contextQuestionsContainer.appendChild(questionDiv);
                }
            });

            submitContextAnswersBtn.style.display = 'block';
            submitContextAnswersBtn.disabled = false;
            // Remove previous listener before adding a new one to avoid multiple submissions
            const newSubmitBtn = submitContextAnswersBtn.cloneNode(true);
            submitContextAnswersBtn.parentNode.replaceChild(newSubmitBtn, submitContextAnswersBtn);
            // Re-assign the variable to the new button to ensure it's the one being used
            window.submitContextAnswersBtn = document.getElementById('submit-context-answers-btn'); // Assuming it has this ID

            window.submitContextAnswersBtn.addEventListener('click', function handler(event) {
                 // `this` refers to the button, use window.submitContextAnswersBtn to be safe if needed
                handleSubmitContextAnswers(projectId);
                // It's important to remove the event listener or ensure it's only added once.
                // Cloning and replacing the button (as done above) is a common way to clear listeners.
                // Alternatively, use `this.removeEventListener('click', handler);` if you are sure about the context.
            });


        } catch (error) {
            displayError(`Error starting project context workflow: ${error.message}`, contextQuestionsContainer);
            submitContextAnswersBtn.style.display = 'none';
        }
    }

    async function handleSubmitContextAnswers(projectId) {
        if (!projectContextModal || !contextQuestionsContainer || !window.submitContextAnswersBtn) {
            console.error('Project context modal elements not found for submitting answers.');
            return;
        }

        window.submitContextAnswersBtn.disabled = true;
        addMessageToUI('user', 'Submitting project context answers...', contextQuestionsContainer); // Temporary message in modal

        let collectedAnswers = "";
        const textareas = (contextAnswersForm || contextQuestionsContainer).querySelectorAll('textarea');
        textareas.forEach(textarea => {
            const question = textarea.getAttribute('data-question');
            const answer = textarea.value.trim();
            if (answer) { // Only include answered questions
                collectedAnswers += `Q: ${question}\nA: ${answer}\n\n`;
            }
        });

        if (!collectedAnswers.trim()) {
            displayError('Please provide answers to at least one question.', contextQuestionsContainer);
            window.submitContextAnswersBtn.disabled = false;
            return;
        }

        try {
            const response = await fetch(`/api/projects/${projectId}/context-answers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAnswersString: collectedAnswers.trim() }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({error: `Failed to submit context answers: ${response.statusText}`}));
                throw new Error(errData.error);
            }
            const result = await response.json();

            projectContextModal.style.display = 'none';
            // Display a success notification on the main page
            const notificationDiv = document.createElement('div');
            notificationDiv.id = 'user-notification';
            notificationDiv.textContent = result.message || 'Project context updated successfully!';
            notificationDiv.className = 'notification-success';
            document.body.insertBefore(notificationDiv, document.body.firstChild);
            setTimeout(() => {
                notificationDiv.style.opacity = '0';
                setTimeout(() => notificationDiv.remove(), 500);
            }, 3000);

            // Optionally, update the project in the local `projects` array
            const projectIndex = projects.findIndex(p => p.id === projectId);
            if (projectIndex !== -1 && result.projectContextAnswers) {
                projects[projectIndex].projectContextAnswers = result.projectContextAnswers;
                // If you have a function that renders project details, call it here
                // renderProjects(); // Might be too broad, consider updating just the specific project display if detailed view exists
            }
            fetchProjects(); // Re-fetch projects to update list with any new indicators

        } catch (error) {
            displayError(`Error submitting context answers: ${error.message}`, contextQuestionsContainer);
            window.submitContextAnswersBtn.disabled = false;
        }
    }


    // --- Objective Functions ---
    async function fetchObjectives(projectId) {
        if (!projectId) return;
        try {
            clearContainer(objectiveListContainer, '.error-message');
            objectiveListContainer.innerHTML = `<p>Loading objectives...</p>`;
            const response = await fetch(`/api/projects/${projectId}/objectives`);
            if (!response.ok) throw new Error(`Failed to fetch objectives: ${response.statusText} (${response.status})`);
            objectives = await response.json();
            renderObjectives();
        } catch (error) {
            displayError(error.message, objectiveListContainer);
        }
    }

    function renderObjectives() {
        clearContainer(objectiveListContainer);
        if (objectives.length === 0) {
            objectiveListContainer.innerHTML = '<p>No objectives for this project yet. Create one below!</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.classList.add('objective-list');
        objectives.forEach(objective => {
            const li = document.createElement('li');
            li.classList.add('objective-item');
            li.innerHTML = `<strong>${objective.title}</strong>`;
            li.dataset.objectiveId = objective.id;
            if (objective.brief) {
                const briefP = document.createElement('p');
                briefP.classList.add('objective-brief');
                briefP.textContent = objective.brief;
                li.appendChild(briefP);
            }
            li.addEventListener('click', () => {
                selectedObjectiveId = objective.id;
                showChatSection();
            });
            ul.appendChild(li);
        });
        objectiveListContainer.appendChild(ul);
    }

    async function handleCreateObjectiveSubmit(event) {
        event.preventDefault();
        clearContainer(createObjectiveForm, '.error-message');
        const title = objectiveTitleInput.value.trim();
        const brief = objectiveBriefInput.value.trim();
        if (!title) {
            displayError('Objective title is required.', createObjectiveForm);
            return;
        }
        if (!selectedProjectId) {
            displayError('No project selected. Cannot create objective.', createObjectiveForm, true);
            return;
        }
        try {
            const response = await fetch(`/api/projects/${selectedProjectId}/objectives`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, brief }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to create objective' }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            fetchObjectives(selectedProjectId);
            objectiveTitleInput.value = '';
            objectiveBriefInput.value = '';
        } catch (error) {
            displayError(error.message, createObjectiveForm);
        }
    }

    // --- Chat Functions ---
    function addMessageToUI(speaker, text) {
        const messageDiv = document.createElement('div');
        // Standardize to 'user' and 'agent' for CSS class consistency
        const role = (speaker && speaker.toLowerCase() === 'user') ? 'user' : 'agent';
        messageDiv.classList.add('message', `${role}-message`);
        messageDiv.textContent = text;
        chatOutput.appendChild(messageDiv);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    async function fetchChatHistory(objectiveId) {
        if (!objectiveId) return;
        // Ensure chat output is clear before loading, but don't add "Loading..." if plan is still pending
        const objective = objectives.find(o => o.id === selectedObjectiveId);
        if (objective && objective.plan && objective.plan.status !== 'approved') {
            // If plan not approved, fetchChatHistory might have been called prematurely or state is off.
            // renderPlan handles the initial message for pending_approval.
            // console.warn("fetchChatHistory called but plan not approved. Chat should not be active.");
            // return; // Exit if plan not approved. renderPlan should manage UI.
        }

        // Only proceed to show "Loading history..." if chat is actually supposed to be active.
        // This is now implicitly handled because fetchChatHistory is called by renderPlan when status is 'approved'.
        clearContainer(chatOutput);
        addMessageToUI('agent', 'Loading chat history...');

        try {
            const response = await fetch(`/api/objectives/${objectiveId}`); // Fetch full objective
            if (!response.ok) {
                throw new Error(`Failed to fetch objective details for chat history: ${response.statusText}`);
            }
            const fetchedObjective = await response.json();
            clearContainer(chatOutput); // Clear "Loading..."

            if (fetchedObjective && fetchedObjective.chatHistory) {
                currentChatHistory = fetchedObjective.chatHistory;
                if (currentChatHistory.length === 0) {
                    addMessageToUI('agent', 'No chat history for this objective yet. Start the conversation!');
                } else {
                    currentChatHistory.forEach(msg => {
                        addMessageToUI(msg.speaker, msg.content);
                    });
                }
            } else {
                 addMessageToUI('agent', 'Could not load chat history.');
            }
        } catch (error) {
            clearContainer(chatOutput); // Clear "Loading..." on error too
            displayError(`Error fetching chat history: ${error.message}`, chatOutput);
            addMessageToUI('agent', `Error loading history: ${error.message}`);
        }
    }

    async function handleSendMessage() {
        const messageText = userInputElement.value.trim();
        if (!messageText) return;
        if (!selectedObjectiveId) {
            displayError('No objective selected to send message to.', null, true);
            return;
        }

        addMessageToUI('user', messageText); // Display user's message immediately
        userInputElement.value = ''; // Clear input field

        try {
            const response = await fetch(`/api/objectives/${selectedObjectiveId}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userInput: messageText }),
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) {
                    errorData = { error: response.statusText };
                }
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.planStatus) { // Check if response indicates a plan state update
                const objective = objectives.find(o => o.id === selectedObjectiveId);
                if (!objective) {
                    console.error("Objective not found in local cache for plan update.");
                    addMessageToUI('agent', "Error: Could not find objective to update its plan status.");
                    return;
                }
                if (!objective.plan) { // Ensure plan object exists
                    objective.plan = { steps: [], questions: [], status: '', currentStepIndex: 0 };
                }

                if (data.planStatus === 'in_progress') {
                    addMessageToUI('agent', data.message); // This is the step execution result
                    objective.plan.status = 'in_progress';
                    // data.currentStep is the index of the step *just processed*
                    objective.plan.currentStepIndex = data.currentStep + 1;
                    renderPlan(objective.plan);
                } else if (data.planStatus === 'completed') {
                    addMessageToUI('agent', data.message); // "All plan steps completed!"
                    objective.plan.status = 'completed';
                    objective.plan.currentStepIndex = objective.plan.steps.length;
                    renderPlan(objective.plan);
                    // Optionally, further UI changes like disabling input:
                    // userInputElement.disabled = true;
                    // userInputElement.placeholder = "Objective completed!";
                    // sendButton.disabled = true;
                } else {
                    // Fallback for other planStatuses if any, or just treat as regular message
                    const agentResponse = data.response || data.message || "Received an update with unhandled plan status.";
                    addMessageToUI('agent', agentResponse);
                }
            } else { // Standard chat message without plan status
                const agentResponse = data.response; // Assuming 'response' for regular chat
                addMessageToUI('agent', agentResponse);
            }

            // Optional: Add to local currentChatHistory if needed, but server is source of truth.
            // For plan execution messages, data.message is the agent's response.
            // For regular chat, data.response is the agent's response.
            // const messageToStore = data.planStatus ? data.message : data.response;
            // currentChatHistory.push({ speaker: 'user', content: messageText, timestamp: new Date() });
            // currentChatHistory.push({ speaker: 'agent', content: messageToStore, timestamp: new Date() });

        } catch (error) {
            console.error('Error sending message to server:', error);
            addMessageToUI('agent', `Error: ${error.message}`);
        }
    }

    // --- Event Listeners ---
    if (createProjectForm) createProjectForm.addEventListener('submit', handleCreateProjectSubmit);
    if (createObjectiveForm) createObjectiveForm.addEventListener('submit', handleCreateObjectiveSubmit);
    if (backToProjectsButton) backToProjectsButton.addEventListener('click', showProjectsSection);
    if (backToObjectivesButton) backToObjectivesButton.addEventListener('click', showObjectivesSection);
    if (backToProjectsFromAssetsButton) backToProjectsFromAssetsButton.addEventListener('click', showProjectsSection);


    if (approvePlanBtn) {
        approvePlanBtn.addEventListener('click', async () => {
            if (!selectedObjectiveId) {
                displayError('No objective selected to approve plan for.', planStatusMessage || chatOutput);
                return;
            }
            approvePlanBtn.disabled = true; // Disable button to prevent multiple clicks
            // planStatusMessage.textContent = 'Approving plan...'; // renderPlan will handle messages
            addMessageToUI('agent', 'Approving plan...');


            try {
                const response = await fetch(`/api/objectives/${selectedObjectiveId}/plan/approve`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json', // Though not strictly necessary for this POST if no body
                    },
                    // No body is needed for this specific request as per current backend design
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Failed to approve plan. Server responded with ${response.status}` }));
                    throw new Error(errorData.error || `Server error: ${response.status}`);
                }

                const updatedObjective = await response.json(); // Expecting the full objective back

                if (updatedObjective && updatedObjective.plan) {
                    // Update the local objectives array
                    const objectiveIndex = objectives.findIndex(o => o.id === selectedObjectiveId);
                    if (objectiveIndex !== -1) {
                        objectives[objectiveIndex] = updatedObjective; // Update the whole objective
                    } else {
                        // If for some reason it's not in the list, add it (less likely scenario)
                        objectives.push(updatedObjective);
                    }
                    renderPlan(updatedObjective.plan); // Re-render the plan section with the new status
                    // The 'Plan approved!' message and chat activation is handled by renderPlan
                } else {
                    throw new Error('Received an invalid response after approving plan.');
                }

            } catch (error) {
                console.error('Error approving plan:', error);
                // Use displayError for consistency, or keep addMessageToUI if preferred for chat-like feedback
                displayError(`Approval failed: ${error.message}`, planStatusMessage); // Show error in plan status area
                approvePlanBtn.disabled = false; // Re-enable button on error
                addMessageToUI('agent', `Failed to approve plan: ${error.message}`); // Also add to chat
            }
        });
    }

    // Event listeners for new social media connect buttons
    if (connectFacebookBtn) {
        connectFacebookBtn.addEventListener('click', () => {
            const name = projectNameInput.value.trim();
            const description = projectDescriptionInput.value.trim();
            // Basic validation, can be enhanced
            if (!name) {
                displayError('Project name is required before connecting.', createProjectForm);
                return;
            }
            sessionStorage.setItem('pendingProjectName', name);
            sessionStorage.setItem('pendingProjectDescription', description);
            window.location.href = '/auth/facebook';
        });
    }

    if (connectTiktokBtn) {
        connectTiktokBtn.addEventListener('click', () => {
            const name = projectNameInput.value.trim();
            const description = projectDescriptionInput.value.trim();
            // Basic validation, can be enhanced
            if (!name) {
                displayError('Project name is required before connecting.', createProjectForm);
                return;
            }
            sessionStorage.setItem('pendingProjectName', name);
            sessionStorage.setItem('pendingProjectDescription', description);
            window.location.href = '/auth/tiktok';
        });
    }

    if (sendButton) sendButton.addEventListener('click', handleSendMessage);
    if (userInputElement) userInputElement.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // --- Initial Load ---
    if (projectContextModal) projectContextModal.style.display = 'none'; // Ensure modal is hidden initially
    showProjectsSection();
    fetchProjects();

    // Event listener for closing the context modal (if a close button exists)
    if (closeContextModalBtn) {
        closeContextModalBtn.addEventListener('click', () => {
            if (projectContextModal) projectContextModal.style.display = 'none';
        });
    }

    // Also hide modal if user clicks outside of it (optional)
    window.addEventListener('click', (event) => {
        if (event.target === projectContextModal) {
            projectContextModal.style.display = 'none';
        }
    });


    // --- UI Notifications from URL parameters ---
    const params = new URLSearchParams(window.location.search);
    const message = params.get('message');
    const status = params.get('status');

    if (message) {
        const notificationDiv = document.createElement('div');
        notificationDiv.id = 'user-notification';
        // Replace + with space, then decode URI component for full message
        notificationDiv.textContent = decodeURIComponent(message.replace(/\+/g, ' '));
        notificationDiv.className = status === 'success' ? 'notification-success' : 'notification-error';

        const appContainer = document.getElementById('app-container'); // Or another suitable parent
        if (appContainer) {
            // Insert it at the top of the app-container, before the header
            appContainer.insertBefore(notificationDiv, appContainer.firstChild);
        } else {
            // Fallback if app-container is not found
            document.body.prepend(notificationDiv);
        }

        setTimeout(() => {
            notificationDiv.style.opacity = '0'; // Start fade out
            setTimeout(() => notificationDiv.remove(), 500); // Remove after fade out
        }, 5000); // Start hiding after 5 seconds

        // Clean the URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log('PWA client app.js fully integrated for Project, Objective, and Chat Management.');

    // --- Asset Management Functions ---
    function showAssetsSection() {
        if (!assetsSection) return;
        projectsSection.style.display = 'none';
        objectivesSection.style.display = 'none';
        chatSection.style.display = 'none';
        assetsSection.style.display = 'block';

        if (selectedProjectId) {
            // Project name is already set by the 'Manage Assets' button click handler
            fetchAndRenderAssets(selectedProjectId);
        } else {
            displayError("No project selected. Please go back and select a project.", assetListContainer, true);
            showProjectsSection();
        }
        if (uploadAssetForm) uploadAssetForm.reset();
        if (uploadStatusMessage) uploadStatusMessage.textContent = '';
    }

    async function fetchAndRenderAssets(projectId) {
        if (!assetListContainer) return;
        clearContainer(assetListContainer);
        assetListContainer.innerHTML = '<p>Loading assets...</p>';

        try {
            const response = await fetch(`/api/projects/${projectId}/assets`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Failed to fetch assets: ${response.statusText}` }));
                throw new Error(errorData.error);
            }
            const assets = await response.json();
            clearContainer(assetListContainer);

            if (assets.length === 0) {
                assetListContainer.innerHTML = '<p>No assets uploaded yet.</p>';
                return;
            }

            const ul = document.createElement('ul');
            ul.classList.add('asset-list');
            assets.forEach(asset => {
                const li = document.createElement('li');
                li.classList.add('asset-item');
                li.innerHTML = `
                    <strong>${asset.name}</strong>
                    <p>Type: ${asset.type}</p>
                    <p><small>Drive ID: ${asset.googleDriveFileId}</small></p>
                    <p><small>Asset ID: ${asset.assetId}</small></p>
                `;
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.classList.add('delete-asset-btn');
                deleteBtn.dataset.assetId = asset.assetId;
                li.appendChild(deleteBtn);
                ul.appendChild(li);
            });
            assetListContainer.appendChild(ul);
        } catch (error) {
            displayError(`Error fetching assets: ${error.message}`, assetListContainer);
        }
    }

    if (uploadAssetForm) {
        uploadAssetForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (!selectedProjectId) {
                if (uploadStatusMessage) uploadStatusMessage.textContent = 'Error: No project selected.';
                return;
            }
            const file = assetFileInput.files[0];
            if (!file) {
                if (uploadStatusMessage) uploadStatusMessage.textContent = 'Error: No file selected.';
                return;
            }

            const formData = new FormData();
            formData.append('assetFile', file);

            if (uploadStatusMessage) uploadStatusMessage.textContent = 'Uploading...';

            try {
                const response = await fetch(`/api/projects/${selectedProjectId}/assets/upload`, {
                    method: 'POST',
                    body: formData, // FormData sets Content-Type automatically for multipart/form-data
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: `Upload failed: ${response.statusText}` }));
                    throw new Error(errorData.error);
                }
                const newAsset = await response.json();
                if (uploadStatusMessage) uploadStatusMessage.textContent = `Upload successful: ${newAsset.name}`;
                assetFileInput.value = ''; // Clear file input
                fetchAndRenderAssets(selectedProjectId); // Refresh asset list
            } catch (error) {
                if (uploadStatusMessage) uploadStatusMessage.textContent = `Upload failed: ${error.message}`;
            } finally {
                setTimeout(() => {
                    if (uploadStatusMessage) uploadStatusMessage.textContent = '';
                }, 5000);
            }
        });
    }

    if (assetListContainer) {
        assetListContainer.addEventListener('click', async function(event) {
            if (event.target.classList.contains('delete-asset-btn')) {
                const assetId = event.target.dataset.assetId;
                if (!selectedProjectId || !assetId) {
                    alert('Error: Project ID or Asset ID missing.');
                    return;
                }
                if (confirm(`Are you sure you want to delete asset ${assetId}? This action cannot be undone.`)) {
                    try {
                        const response = await fetch(`/api/projects/${selectedProjectId}/assets/${assetId}`, {
                            method: 'DELETE',
                        });
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ error: `Failed to delete asset: ${response.statusText}` }));
                            throw new Error(errorData.error);
                        }
                        // Deletion successful, refresh the asset list
                        fetchAndRenderAssets(selectedProjectId);
                        alert('Asset deleted successfully.');
                    } catch (error) {
                        alert(`Error deleting asset: ${error.message}`);
                    }
                }
            }
        });
    }
});
