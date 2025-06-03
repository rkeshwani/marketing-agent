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

        plan.steps = plan.steps || []; // Ensure steps is an array
        plan.questions = plan.questions || []; // Ensure questions is an array

        plan.steps.forEach(step => {
            const li = document.createElement('li');
            li.textContent = step;
            planStepsList.appendChild(li);
        });

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
            planStatusMessage.textContent = 'Plan approved! You can now proceed with the objective.';
            approvePlanBtn.style.display = 'none';
            chatInputArea.style.display = 'flex';
            planDisplaySection.style.display = 'block';
            // Fetch chat history only after plan is confirmed approved
            fetchChatHistory(selectedObjectiveId);
        } else { // No plan, or other statuses
            planStatusMessage.textContent = 'No active plan.';
            planDisplaySection.style.display = 'none';
            chatInputArea.style.display = 'none';
            // Potentially try to initialize if no plan status is known
            // This case might be hit if plan is null/undefined
            if (!plan.status && selectedObjectiveId) {
                 // This path is more explicitly handled in fetchAndDisplayPlan's 404 case
                 addMessageToUI('agent', "No plan information available. Attempting to initialize...");
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
        try {
            // In a real app, this would be: const planResponse = await fetch(`/api/objectives/${objectiveId}/plan`);
            // Simulating fetch for objective details which include the plan
            const objectiveResponse = await fetch(`/api/objectives/${objectiveId}`);

            if (!objectiveResponse.ok) {
                if (objectiveResponse.status === 404) {
                    addMessageToUI('agent', 'Objective not found, cannot retrieve or initialize plan.');
                    planDisplaySection.style.display = 'none';
                    chatInputArea.style.display = 'none';
                    return;
                }
                throw new Error(`Failed to fetch objective details: ${objectiveResponse.statusText}`);
            }
            const objectiveData = await objectiveResponse.json();

            if (objectiveData && objectiveData.plan) {
                 if (objectiveData.plan.status === 'pending_approval' || objectiveData.plan.status === 'approved') {
                    renderPlan(objectiveData.plan);
                } else if (!objectiveData.plan.steps || objectiveData.plan.steps.length === 0) {
                    // Plan exists but is empty or in an unknown state, try to initialize
                    addMessageToUI('agent', 'Current plan is empty or status is unclear. Attempting to initialize a new plan...');
                    const initResponse = await fetch(`/api/objectives/${objectiveId}/initialize-agent`, { method: 'POST' });
                    if (!initResponse.ok) throw new Error(`Failed to initialize plan: ${initResponse.statusText}`);
                    const newObjectiveData = await initResponse.json(); // Expecting the full objective with the plan
                    renderPlan(newObjectiveData.plan);
                } else {
                    // Plan exists but status is not one we explicitly handle for plan display (e.g. might be user modified)
                    // For now, just render it. Might need more states later.
                    renderPlan(objectiveData.plan);
                }
            } else {
                // No plan object within the objective, or objectiveData is malformed - try to initialize.
                addMessageToUI('agent', 'No plan found for this objective. Attempting to initialize a new plan...');
                const initResponse = await fetch(`/api/objectives/${objectiveId}/initialize-agent`, { method: 'POST' });
                if (!initResponse.ok) throw new Error(`Failed to initialize plan after finding no plan: ${initResponse.statusText}`);
                const newObjectiveData = await initResponse.json();
                renderPlan(newObjectiveData.plan);
            }

        } catch (error) {
            console.error('Error in fetchAndDisplayPlan:', error);
            const errorDisplayArea = planDisplaySection.style.display === 'none' ? chatOutput : planStatusMessage;
            displayError(error.message, errorDisplayArea);
            planDisplaySection.style.display = 'block'; // Ensure plan section is visible to show error
            planStatusMessage.textContent = `Error: ${error.message}`; // show error in plan status
            chatInputArea.style.display = 'none';
            approvePlanBtn.style.display = 'none';
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
            fetchProjects();
            projectNameInput.value = '';
            projectDescriptionInput.value = '';
        } catch (error) {
            displayError(error.message, createProjectForm);
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
            const agentResponse = data.response;
            addMessageToUI('agent', agentResponse);

            // Optional: Add to local currentChatHistory if needed, but server is source of truth.
            // currentChatHistory.push({ speaker: 'user', content: messageText, timestamp: new Date() });
            // currentChatHistory.push({ speaker: 'agent', content: agentResponse, timestamp: new Date() });

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
    showProjectsSection();
    fetchProjects();

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
