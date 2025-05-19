import * as vscode from 'vscode';
import { runnerState, expiryNotificationTime, runnerConfig } from './data';
import { addTime, getRunnerInfo } from './api';

// Global interval reference for session expiry checks
let expiryCheckInterval: NodeJS.Timeout | undefined;

// Start checking for session expiry globally
export function startGlobalExpiryCheck(provider: any) {
    // Clear any existing interval
    stopGlobalExpiryCheck();

    // Check every 30 seconds
    expiryCheckInterval = setInterval(() => {
        checkSessionExpiry(provider);
    }, 30000); // 30 seconds
    
    // Do an initial check right away
    checkSessionExpiry(provider);
}

// Stop the global expiry check
export function stopGlobalExpiryCheck() {
    if (expiryCheckInterval) {
        clearInterval(expiryCheckInterval);
        expiryCheckInterval = undefined;
    }
}

// Check if the session is about to expire
async function checkSessionExpiry(provider: any) {
    if (!runnerState.sessionEnd) {
        return; // No session end time available yet
    }

    const now = new Date();
    const sessionEnd = new Date(runnerState.sessionEnd);
    
    // Calculate minutes remaining
    const minutesRemaining = (sessionEnd.getTime() - now.getTime()) / (1000 * 60);
    
    // Show notification if less than expiry_notification_time minutes remaining
    // but more than 0 minutes (not expired yet)
    if (minutesRemaining > 0 && minutesRemaining < expiryNotificationTime) {
        // Execute the add time command directly - this will show the modal
        vscode.commands.executeCommand("cloud-ide-extension.addTime", provider);
    }

    // Also update the webview if it's visible
    provider.updateSessionTime();
}

export async function updateRunnerData(): Promise<void> {
    try {
        const response = await getRunnerInfo();
        const json = await response.json();
        
        // Store the original UTC session times
        const utcSessionEnd = json.session_end;
        const utcSessionStart = json.session_start;
        
        // Convert UTC times to local time
        // This assumes the API returns ISO format strings (e.g., "2025-05-02T15:30:00Z")
        const localSessionEnd = new Date(utcSessionEnd).toISOString();
        const localSessionStart = new Date(utcSessionStart).toISOString();
        
        // Update the runner object with the converted times
        runnerState.sessionEnd = localSessionEnd;
        
        return Promise.resolve();
    } catch (error) {
        console.error('Error updating runner data:', error);
        return Promise.reject(error);
    }
}

export function registerSessionCommands(context: vscode.ExtensionContext, provider: any) {
    let isModalActive = false;
    
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.addTime', async (webviewProvider) => {
            // If a modal is already active, don't show another one
            if (isModalActive) {
                return;
            }
            
            // Set the flag to indicate a modal is active
            isModalActive = true;
            
            // Create a promise that resolves after expiry_notification_time minutes
            const timeoutPromise = new Promise<string | undefined>((resolve) => {
                setTimeout(() => {
                    // Reset the flag when the timeout occurs
                    isModalActive = false;
                    resolve(undefined); // Resolve with undefined to indicate timeout
                }, expiryNotificationTime * 60 * 1000); // Convert minutes to milliseconds
            });
            
            if (new Date(new Date(runnerConfig.sessionStart).getTime() + runnerConfig.maxSessionTime * 1000).getTime() 
                < new Date(new Date(runnerState.sessionEnd).getTime() + 60 * 60 * 1000).getTime()){
                    const messagePromise = vscode.window.showInformationMessage(
                        'Your session has exceeded its maximum lifetime. The IDE will shut down soon.',
                        { modal: true },
                        'OK'
                    );

                    // Race the message promise against the timeout promise
                    const selection = await Promise.race([messagePromise, timeoutPromise]);
                    
                    // If the dialog timed out, just return
                    if (!selection) {
                        return;
                    }
            } else {
                // Show a modal information message with only the "Add 30 Minutes" button
                const messagePromise = vscode.window.showInformationMessage(
                    'Your session is about to expire. Would you like to add more time?',
                    { modal: true },
                    'Add 30 Minutes'
                );
                
                // Race the message promise against the timeout promise
                const selection = await Promise.race([messagePromise, timeoutPromise]);
                
                // If the dialog timed out, just return
                if (!selection) {
                    return;
                } else {
                    isModalActive = false;
                }
                
                // If the user clicked "Add 30 Minutes"
                if (selection === 'Add 30 Minutes') {
                    try {
                        // Call the API to add 30 minutes (parameter is minutes * 2)
                        const response = await addTime(30);
                        const json = await response.json();
                        isModalActive = false;
                        // Update the runner data with the new session end time
                        await updateRunnerData();
                        // Refresh the webview to show the updated time
                        if (webviewProvider) {
                            webviewProvider.refresh();
                        } else if (provider) {
                            provider.refresh();
                        }
                        // Show confirmation to the user
                        vscode.window.showInformationMessage('Successfully added 30 minutes to your session.');
                    } catch (error) {
                        console.error('Error adding time:', error);
                        vscode.window.showErrorMessage('Failed to add time to your session.');
                    }
                }
            }
        })
    );
}