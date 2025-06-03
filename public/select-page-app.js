// public/select-page-app.js
document.addEventListener('DOMContentLoaded', () => {
    const pageListContainer = document.getElementById('page-list-container');
    const confirmButton = document.getElementById('confirm-page-selection-btn');
    const errorMessageContainer = document.getElementById('error-message-container');

    let state = null;

    function displayError(message, isNetworkError = false) {
        console.error(message);
        let fullMessage = message;
        if (isNetworkError) {
            fullMessage = "A network error occurred. Please check your internet connection and try again.";
        }
        errorMessageContainer.textContent = fullMessage;
        errorMessageContainer.style.display = 'block';

        const loadingMessage = pageListContainer.querySelector('.loading-message');
        if (loadingMessage) loadingMessage.style.display = 'none'; // Hide loading message
        confirmButton.disabled = true; // Disable button on error to prevent further actions
    }

    function clearError() {
        errorMessageContainer.textContent = '';
        errorMessageContainer.style.display = 'none';
    }

    async function initialize() {
        const params = new URLSearchParams(window.location.search);
        state = params.get('state');

        if (!state) {
            displayError('Error: No state parameter found in URL. Cannot proceed with page selection.');
            confirmButton.disabled = true;
            return;
        }

        try {
            const response = await fetch(`/api/facebook/pages?state=${state}`);
            if (!response.ok) {
                let errorMsg = `Server error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    // Ignore if response is not JSON
                }
                throw new Error(errorMsg);
            }

            const pages = await response.json();

            if (!pages || pages.length === 0) {
                // More specific message here based on typical reasons
                displayError('No Facebook Pages found. This could be because you have no pages, or necessary permissions (like "pages_show_list") were not granted during authentication. Please check your Facebook permissions for this app or try reconnecting.');
                // confirmButton.disabled = true; // displayError already disables
                return;
            }
            confirmButton.disabled = false; // Enable button if pages are loaded
            renderPages(pages);

        } catch (error) {
            if (error instanceof TypeError) { // Suggests a network error
                 displayError(`Error fetching Facebook pages: ${error.message}`, true);
            } else {
                 displayError(`Error fetching Facebook pages: ${error.message}`);
            }
            // confirmButton.disabled = true; // displayError already disables
        }
    }

    function renderPages(pages) {
        pageListContainer.innerHTML = ''; // Clear "Loading pages..."
        const form = document.createElement('form');
        form.id = 'facebook-page-select-form';

        pages.forEach(page => {
            const label = document.createElement('label');
            label.classList.add('page-selection-label'); // For styling

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'facebookPage';
            radio.value = page.id;
            // Store page_access_token and permissions if needed later, or rely on backend to re-fetch/use from session
            // For simplicity, we'll primarily use the selectedPageID and let backend derive other details from session.
            // radio.dataset.token = page.access_token; // Example if needed
            // radio.dataset.perms = JSON.stringify(page.perms); // Example if needed

            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${page.name} (ID: ${page.id})`));
            form.appendChild(label);
            form.appendChild(document.createElement('br'));
        });
        pageListContainer.appendChild(form);
    }

    confirmButton.addEventListener('click', async () => {
        clearError();
        const selectedRadio = document.querySelector('input[name="facebookPage"]:checked');
        if (!selectedRadio) {
            displayError('Please select a Facebook Page.');
            return;
        }

        const selectedPageID = selectedRadio.value;
        const pendingProjectName = sessionStorage.getItem('pendingProjectName');
        const pendingProjectDescription = sessionStorage.getItem('pendingProjectDescription');

        if (!pendingProjectName) { // Description can be empty
            displayError('Error: Project name not found in session. Please try creating the project again.');
            return;
        }
         if (!state) { // Should have been caught on init, but double check
            displayError('Error: Session state is missing. Cannot finalize project.');
            return;
        }


        try {
            const response = await fetch('/api/facebook/finalize-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state: state,
                    selectedPageID: selectedPageID,
                    projectName: pendingProjectName,
                    projectDescription: pendingProjectDescription
                    // The backend will retrieve fbUserToken, facebookUserID, and page-specific access_token
                    // from the session using the 'state' and selectedPageID.
                })
            });

            if (!response.ok) { // Check for any non-2xx status
                let errorMsg = `Server error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    // Ignore if response is not JSON
                }
                throw new Error(errorMsg);
            }

            // Successful creation (status 201 or other 2xx)
            sessionStorage.removeItem('pendingProjectName');
            sessionStorage.removeItem('pendingProjectDescription');
            window.location.href = '/?message=Project+successfully+created+with+Facebook&status=success';

        } catch (error) {
            if (error instanceof TypeError) { // Suggests a network error
                displayError(`Error finalizing project: ${error.message}. Please check your connection.`, true);
            } else {
                displayError(`Error finalizing project: ${error.message}`);
            }
        }
    });

    initialize();
});
