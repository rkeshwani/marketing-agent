// public/finalize-project-app.js
document.addEventListener('DOMContentLoaded', () => {
    const statusContainer = document.getElementById('finalization-status');

    function displayMessage(message, isError = false, showHomeLink = false) {
        console.log(message); // Keep console log for debugging
        let content = `<p class="${isError ? 'error-message' : 'success-message'}">${message}</p>`;
        if (isError && showHomeLink) {
            content += `<p><a href="/">Return to Homepage</a></p>`;
        }
        statusContainer.innerHTML = content;
    }

    async function finalizeProject() {
        const params = new URLSearchParams(window.location.search);
        const state = params.get('state');
        const service = params.get('service');

        if (!state || !service) {
            displayMessage('Error: Critical information (state or service type) is missing from the URL. Unable to proceed with project finalization. Please try initiating the connection again from the project creation form.', true, true);
            return;
        }

        const pendingProjectName = sessionStorage.getItem('pendingProjectName');
        const pendingProjectDescription = sessionStorage.getItem('pendingProjectDescription');

        if (!pendingProjectName) {
            displayMessage('Error: Essential project details (like project name) were not found in your browser session. This can happen if the session expired or was cleared. Please attempt to create the project again.', true, true);
            return;
        }

        if (service === 'tiktok') {
            displayMessage('Finalizing TikTok connection... Please wait.');
            try {
                const response = await fetch('/api/tiktok/finalize-project', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        state: state,
                        projectName: pendingProjectName,
                        projectDescription: pendingProjectDescription
                    })
                });

                if (!response.ok) {
                    let errorMsg = `Server error: ${response.status}.`;
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.error || errorMsg; // Use server's error message if available
                    } catch (e) {
                        // Response was not JSON, stick with the status code message.
                    }
                    // This error is from our backend, guide user appropriately.
                    throw new Error(`${errorMsg} Please ensure all details are correct or try reconnecting TikTok.`);
                }

                // const newProject = await response.json(); // Data available if needed
                sessionStorage.removeItem('pendingProjectName');
                sessionStorage.removeItem('pendingProjectDescription');

                // Success: Redirect to home page with a success message
                window.location.href = `/?message=Project+successfully+created+and+connected+with+TikTok!&status=success`;

            } catch (error) {
                console.error('Error finalizing TikTok project:', error);
                // Distinguish between network error and application error from the throw above
                if (error instanceof TypeError) { // Indicates a possible network error
                    displayMessage('A network error occurred while finalizing the TikTok connection. Please check your internet connection and try again.', true, true);
                } else { // Application error (either from server response or client-side logic)
                    displayMessage(`Error creating project with TikTok: ${error.message}`, true, true);
                }
            }
        } else if (service === 'facebook') {
            displayMessage(`Redirecting for Facebook finalization... This page is typically for services like TikTok that don't have an intermediate selection step.`, false);
            if (state) {
                setTimeout(() => {
                    window.location.href = `/select-facebook-page.html?state=${state}`; // Redirect to the correct FB flow
                }, 2000); // Short delay for message visibility
            } else {
                 displayMessage('Error: State missing for Facebook redirection. Cannot proceed.', true, true);
            }
        } else if (service === 'linkedin') {
            displayMessage('Finalizing LinkedIn connection... Please wait.');
            try {
                const response = await fetch('/api/linkedin/finalize-project', { // Ensure this endpoint exists or will be created
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        state: state,
                        projectName: pendingProjectName,
                        projectDescription: pendingProjectDescription
                    })
                });

                if (!response.ok) {
                    let errorMsg = `Server error: ${response.status}.`;
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) {
                        // Response not JSON
                    }
                    throw new Error(`${errorMsg} Please ensure all details are correct or try reconnecting LinkedIn.`);
                }

                // const newProject = await response.json(); // Data available if needed
                sessionStorage.removeItem('pendingProjectName');
                sessionStorage.removeItem('pendingProjectDescription');

                window.location.href = `/?message=Project+successfully+created+and+connected+with+LinkedIn!&status=success`;

            } catch (error) {
                console.error('Error finalizing LinkedIn project:', error);
                if (error instanceof TypeError) {
                    displayMessage('A network error occurred while finalizing the LinkedIn connection. Please check your internet connection and try again.', true, true);
                } else {
                    displayMessage(`Error creating project with LinkedIn: ${error.message}`, true, true);
                }
            }
        } else {
            displayMessage(`Error: Unknown or unsupported service type ('${service}') requested for finalization. Cannot proceed.`, true, true);
        }
    }

    finalizeProject();
});
