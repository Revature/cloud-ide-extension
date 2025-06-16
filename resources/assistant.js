// Get VS Code API
const vscode = acquireVsCodeApi();

function improveMyCode() {
    vscode.postMessage({
        command: 'improveMyCode'
    });
}

function suggestTestCases() {
    vscode.postMessage({
        command: 'suggestTestCases'
    });
}

function checkMyCode() {
    vscode.postMessage({
        command: 'checkMyCode'
    });
}

function copyResponse() {
    vscode.postMessage({
        command: 'copyResponse'
    });
}

// Handle messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'updateState':
            updateUIState(message.data);
            break;
    }
});

function updateUIState(data) {
    const {
        hasContent,
        apiResponse,
        isLoading,
        hasAnalyzed,
        currentAction
    } = data;

    // Get UI elements
    const welcomeState = document.getElementById('welcomeState');
    const noEditor = document.getElementById('noEditor');
    const actionsSection = document.getElementById('actionsSection');
    const responseSection = document.getElementById('responseSection');
    const loadingSection = document.getElementById('loadingSection');
    const responseContent = document.getElementById('responseContent');
    const responseTitle = document.getElementById('responseTitle');

    // Get all action buttons
    const checkButton = document.getElementById('checkButton');
    const improveButton = document.getElementById('improveButton');
    const testButton = document.getElementById('testButton');

    // Update loading state
    if (isLoading) {
        // Show loading spinner and disable all buttons
        loadingSection.style.display = 'block';
        if (checkButton) checkButton.disabled = true;
        if (improveButton) improveButton.disabled = true;
        if (testButton) testButton.disabled = true;
        
        // Update loading message based on current action
        const loadingSpinner = document.getElementById('loadingSpinner');
        const actionMessages = {
            'check': '⟳ Checking your code...',
            'improve': '⟳ Improving your code...',
            'test': '⟳ Generating test cases...'
        };
        if (loadingSpinner) {
            loadingSpinner.textContent = actionMessages[currentAction] || '⟳ Processing...';
        }
    } else {
        // Hide loading spinner and enable all buttons
        if (loadingSection) loadingSection.style.display = 'none';
        if (checkButton) checkButton.disabled = false;
        if (improveButton) improveButton.disabled = false;
        if (testButton) testButton.disabled = false;
    }

    if (!hasContent) {
        // No editor content - show no editor state
        if (welcomeState) welcomeState.style.display = 'none';
        if (noEditor) noEditor.style.display = 'block';
        if (actionsSection) actionsSection.style.display = 'none';
        if (responseSection) responseSection.style.display = 'none';
    } else {
        // Has content - always show actions section
        if (welcomeState) welcomeState.style.display = hasAnalyzed || isLoading ? 'none' : 'block';
        if (noEditor) noEditor.style.display = 'none';
        if (actionsSection) actionsSection.style.display = 'block';
        
        // Show response section when loading, has analyzed, or has a response
        if (isLoading || hasAnalyzed || (apiResponse && apiResponse.trim())) {
            if (responseSection) responseSection.style.display = 'block';
            
            // Update response content
            if (isLoading) {
                if (responseContent) {
                    responseContent.innerHTML = '<div class="loading-message">🤖 AI is analyzing your code...</div>';
                }
            } else if (apiResponse && apiResponse.trim()) {
                // Set title based on the last action
                const actionTitles = {
                    'check': '🔍 Code Review',
                    'improve': '✨ Code Improvements',
                    'test': '🧪 Test Case Suggestions'
                };
                if (responseTitle) {
                    responseTitle.textContent = actionTitles[currentAction] || 'AI Response';
                }
                
                if (responseContent) {
                    responseContent.innerHTML = formatResponse(apiResponse);
                }
            }
        } else {
            if (responseSection) responseSection.style.display = 'none';
        }
    }
}

function formatResponse(response) {
    // Basic formatting for better readability
    return response
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>')
        .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Request initial state from the extension
    vscode.postMessage({
        command: 'requestInitialState'
    });
});