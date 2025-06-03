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
        userInputElement.value = ''; // Clear input field

        if (selectedObjectiveId) {
            const objective = objectives.find(o => o.id === selectedObjectiveId);
            selectedObjectiveTitleElement.textContent = objective ? objective.title : "Objective";
            await fetchChatHistory(selectedObjectiveId); // Fetch and render history
        } else {
            displayError("No objective selected for chat.", chatOutput, true);
            showObjectivesSection(); // Redirect if no objective ID
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
            ul.appendChild(li);
        });
        projectListContainer.appendChild(ul);
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
        clearContainer(chatOutput); // Clear previous chat messages
        addMessageToUI('agent', 'Loading chat history...'); // Show loading message
        try {
            const response = await fetch(`/api/objectives/${objectiveId}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch objective details: ${response.statusText}`);
            }
            const objective = await response.json();
            clearContainer(chatOutput); // Clear "Loading..." message
            if (objective && objective.chatHistory) {
                currentChatHistory = objective.chatHistory;
                if (currentChatHistory.length === 0) {
                    addMessageToUI('agent', 'No chat history for this objective yet. Start the conversation!');
                } else {
                    currentChatHistory.forEach(msg => {
                        // Adapt message structure if necessary. Assuming server sends {speaker, content}
                        // The dataStore.addMessageToObjectiveChat saves {speaker, content, timestamp}
                        addMessageToUI(msg.speaker, msg.content);
                    });
                }
            } else {
                 addMessageToUI('agent', 'Could not load chat history.');
            }
        } catch (error) {
            clearContainer(chatOutput);
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
});
