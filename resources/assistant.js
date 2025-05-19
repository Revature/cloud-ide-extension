// Get VS Code API
const vscode = acquireVsCodeApi();

function analyzeWithAI() {
    vscode.postMessage({
        command: 'analyzeWithAI'
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
        hasAnalyzed
    } = data;

    // Get UI elements
    const welcomeState = document.getElementById('welcomeState');
    const noEditor = document.getElementById('noEditor');
    const analyzeSection = document.getElementById('analyzeSection');
    const responseSection = document.getElementById('responseSection');
    const analyzeButton = document.getElementById('analyzeButton');
    const analyzeButtonText = document.getElementById('analyzeButtonText');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const responseContent = document.getElementById('responseContent');

    // Update button state based on loading
    if (isLoading) {
        analyzeButton.disabled = true;
        analyzeButtonText.style.display = 'none';
        loadingSpinner.style.display = 'inline';
        analyzeButton.classList.add('loading');
    } else {
        analyzeButton.disabled = false;
        analyzeButtonText.style.display = 'inline';
        loadingSpinner.style.display = 'none';
        analyzeButton.classList.remove('loading');
    }

    if (!hasContent) {
        // No editor content - show no editor state
        welcomeState.style.display = 'none';
        noEditor.style.display = 'block';
        analyzeSection.style.display = 'none';
        responseSection.style.display = 'none';
    } else {
        // Has content - always show analyze section
        welcomeState.style.display = hasAnalyzed || isLoading ? 'none' : 'block';
        noEditor.style.display = 'none';
        analyzeSection.style.display = 'block';
        
        // Show response section when loading, has analyzed, or has a response
        if (isLoading || hasAnalyzed || (apiResponse && apiResponse.trim())) {
            responseSection.style.display = 'block';
            
            // Update response content
            if (isLoading) {
                responseContent.textContent = 'Analyzing your code...';
                responseContent.style.fontStyle = 'italic';
                responseContent.style.color = 'var(--vscode-descriptionForeground)';
            } else if (apiResponse && apiResponse.trim()) {
                responseContent.textContent = apiResponse;
                responseContent.style.fontStyle = 'normal';
                responseContent.style.color = 'var(--vscode-foreground)';
            }
        } else {
            responseSection.style.display = 'none';
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Start with welcome state visible (classes will handle initial visibility)
    document.getElementById('welcomeState').classList.remove('hidden');
    document.getElementById('noEditor').classList.add('hidden');
    document.getElementById('analyzeSection').classList.add('hidden');
    document.getElementById('responseSection').classList.add('hidden');
    
    // Request initial state from the extension
    vscode.postMessage({
        command: 'requestInitialState'
    });
});