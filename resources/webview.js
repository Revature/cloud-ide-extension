(function() {
    const vscode = acquireVsCodeApi();
    let countdownInterval;
    let sessionEndTime;
    let expiryNotificationTime;
    
    // Add log to show script is running
    console.log('Webview script initialized');
    
    // Request the session end time as soon as the webview loads
    vscode.postMessage({
        command: 'getSessionEndTime'
    });
    
    // Listen for messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        if (message.command === 'updateSessionEndTime') {
            console.log('Received session end time:', message.sessionEndTime);
            sessionEndTime = new Date(message.sessionEndTime);
            
            // Update end time display
            const endTimeDisplay = document.getElementById('endTimeDisplay');
            endTimeDisplay.textContent = 'Ends at: ' + sessionEndTime.toLocaleString();
            
            // Clear any existing interval
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
            
            // Start the countdown
            updateCountdown();
            countdownInterval = setInterval(updateCountdown, 1000);
        }
    });
    
    function updateCountdown() {
        if (!sessionEndTime) return;
        
        const now = new Date();
        const timeRemaining = sessionEndTime - now;
        
        // Get the Add Time button
        const addTimeBtn = document.getElementById('addTimeBtn');
        
        if (timeRemaining <= 0) {
            document.getElementById('countdown').textContent = 'Session expired!';
            document.getElementById('countdown').classList.add('warning');
            // Show the Add Time button when session is expired
            addTimeBtn.style.display = 'block';
            clearInterval(countdownInterval);
            return;
        }
        
        // Calculate hours, minutes, and seconds
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
        
        // Format the countdown
        const formattedTime = 
            (hours > 0 ? hours + ' hours, ' : '') + 
            (minutes < 10 ? '0' : '') + minutes + ':' + 
            (seconds < 10 ? '0' : '') + seconds;
        
        document.getElementById('countdown').textContent = "Session will end in: " + formattedTime;
        
        // Show or hide Add Time button based on time remaining
        // Now using the value passed from the extension
        if (timeRemaining <= expiryNotificationTime) {
            // Show the Add Time button when less than expiry_notification_time minutes remain
            addTimeBtn.style.display = 'block';
            
            // Add warning class to countdown when time is running out
            document.getElementById('countdown').classList.add('warning');
        } else {
            // Hide the Add Time button when more than expiry_notification_time minutes remain
            addTimeBtn.style.display = 'none';
            
            // Remove warning class when there's plenty of time
            document.getElementById('countdown').classList.remove('warning');
        }
    }
    
    // Alternative way to set up event listeners if DOMContentLoaded might have already fired
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupEventListeners);
    } else {
        setupEventListeners();
    }
    
    function setupEventListeners() {
        document.getElementById('openDevServerBtn').addEventListener('click', () => {
            console.log('Open dev server button clicked');
            vscode.postMessage({
                command: 'openDevServer'
            });
        });
        
        document.getElementById('showInfoBtn').addEventListener('click', () => {
            console.log('Show info button clicked');
            vscode.postMessage({
                command: 'showInfo'
            });
        });
        
        // Add event listener for the add time button
        document.getElementById('addTimeBtn').addEventListener('click', () => {
            console.log('Add time button clicked');
            vscode.postMessage({
                command: 'addTime'
            });
        });
    }
})();