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
    
    window.addEventListener('message', event => {
        const message = event.data;
        
        if (message.command === 'updateSessionEndTime') {
            console.log('Received session end time:', message.sessionEndTime);
            console.log('Expiry notification time:', message.expiryNotificationTime);
            
            sessionEndTime = new Date(message.sessionEndTime);
            
            // Store the expiry notification time in milliseconds
            if (message.expiryNotificationTime) {
                // Convert minutes to milliseconds for comparison
                expiryNotificationTime = message.expiryNotificationTime * 60 * 1000;
            } else {
                // Default to 10 minutes if not provided
                expiryNotificationTime = 10 * 60 * 1000;
            }
            
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
        
        // Get the session management container
        const sessionManagementContainer = document.getElementById('sessionManagementContainer');
        const sessionInfo = document.getElementById('sessionInfo');
        
        // First, calculate and update the countdown display
        if (timeRemaining <= 0) {
            document.getElementById('countdown').textContent = 'Session expired!';
            document.getElementById('countdown').classList.add('warning');
            clearInterval(countdownInterval);
        } else {
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
        }
        
        // Now update the session management section (button or info text)
        if (timeRemaining <= 0 || timeRemaining <= expiryNotificationTime) {
            // Session is expired or about to expire - show button
            
            // Check if button already exists
            let addTimeBtn = document.getElementById('addTimeBtn');
            
            if (!addTimeBtn) {
                // Button doesn't exist yet, create it
                sessionInfo.innerHTML = ''; // Clear the info text
                
                addTimeBtn = document.createElement('button');
                addTimeBtn.id = 'addTimeBtn';
                addTimeBtn.className = 'button';
                addTimeBtn.textContent = 'Time Management';
                
                // Add event listener to the button
                addTimeBtn.addEventListener('click', () => {
                    console.log('Add time button clicked');
                    vscode.postMessage({
                        command: 'addTime'
                    });
                });
                
                // Add the button to the container
                sessionManagementContainer.appendChild(addTimeBtn);
            }
            
            // Add warning class to countdown when time is running out
            document.getElementById('countdown').classList.add('warning');
        } else {
            // Session has plenty of time left - show info text
            
            // Check if button exists and remove it
            const addTimeBtn = document.getElementById('addTimeBtn');
            if (addTimeBtn) {
                addTimeBtn.remove();
            }
            
            const minutesBeforeExpiry = Math.ceil(expiryNotificationTime / (60 * 1000));
            sessionInfo.textContent = `You will be able to extend your session ${minutesBeforeExpiry} minutes before it expires.`;
            sessionInfo.className = 'small-info'; // Apply the CSS class
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
    }
})();