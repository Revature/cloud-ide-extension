import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, runnerState, expiryNotificationTime, runnerConfig } from './data';
import { addTime, getDevServer, getRunnerInfo } from './api';

// Global interval reference for session expiry checks
let expiryCheckInterval: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext) {
    // Create and register webview panel provider
    const provider = new CloudIdeWebviewProvider(context.extensionUri);
    
    // Register the webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cloudIdeWebview', provider)
    );

    // Register commands
    registerCommands(context, provider);

    getConfig();

    // Get initial runner info 
    await updateRunnerData();
    provider.refresh();

    try {
        const defaultReadmePath = "/home/ubuntu/readme.md";
        // The path can be absolute or relative to the workspace
        if(runnerConfig.filePath == null){
            let fileExists : boolean = fs.existsSync(defaultReadmePath);
            if(fileExists){
                console.log("Opening default readme file")
                const document = await vscode.workspace.openTextDocument(defaultReadmePath);
                // First show the document in the editor
                const editor = await vscode.window.showTextDocument(document);
                // Then open the markdown preview
                await vscode.commands.executeCommand('markdown.showPreview');
                }
        }else{
            let fileExists : boolean = fs.existsSync(runnerConfig.filePath);
            if(fileExists){
                console.log("Opening provided startup file")
                const filePath  = vscode.Uri.file(runnerConfig.filePath as string);
                const document = await vscode.workspace.openTextDocument(filePath);
                if(runnerConfig.filePath.includes(".md")){

                    const document = await vscode.workspace.openTextDocument(filePath);
                    // First show the document in the editor
                    const editor = await vscode.window.showTextDocument(document);
                    // Then open the markdown preview
                    await vscode.commands.executeCommand('markdown.showPreview');
                                    
                }else{
                    await vscode.window.showTextDocument(document);    
                }
                        
            }
            else{
                console.error(`The startup file provided does not exist: ${runnerConfig.filePath}`)
            }
            
        }
    } catch (error) {
        console.error('Error opening file on startup:', error);
    }

    // Start the global expiry check - this will run regardless of webview state
    startGlobalExpiryCheck(provider);

    // Make sure to dispose resources when the extension is deactivated
    context.subscriptions.push({
        dispose: () => {
            provider.dispose();
            stopGlobalExpiryCheck();
        }
    });
}

// Start checking for session expiry globally
function startGlobalExpiryCheck(provider: CloudIdeWebviewProvider) {
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
function stopGlobalExpiryCheck() {
    if (expiryCheckInterval) {
        clearInterval(expiryCheckInterval);
        expiryCheckInterval = undefined;
    }
}

// Check if the session is about to expire
async function checkSessionExpiry(provider: CloudIdeWebviewProvider) {
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

// Webview Provider Implementation
class CloudIdeWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
    
        // Set options for the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
    
        // Get CSS and JS file paths
        const styleMainUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
        );
        
        const scriptUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview.js')
        );
    
        // Set the webview's html content
        webviewView.webview.html = this._getHtmlForWebview(styleMainUri, scriptUri);
    
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                
                switch (message.command) {
                    case 'openDevServer':
                        vscode.commands.executeCommand('cloud-ide-extension.openDevServer');
                        return;
                    case 'showInfo':
                        vscode.commands.executeCommand('cloud-ide-extension.showInfo');
                        return;
                    case 'addTime':
                        vscode.commands.executeCommand('cloud-ide-extension.addTime', this);
                        return;
                    case 'getSessionEndTime':
                        this.updateSessionTime();
                        return;
                }
            }
        );

        // Update session time when view is first loaded
        this.updateSessionTime();
    }

    // Update the session time in the webview
    public updateSessionTime() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateSessionEndTime',
                sessionEndTime: runnerState.sessionEnd,
                expiryNotificationTime: expiryNotificationTime
            });
        }
    }

    public refresh() {
        if (this._view) {
            // Get CSS and JS file paths
            const styleMainUri = this._view.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
            );
            
            const scriptUri = this._view.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview.js')
            );
            
            // Update the HTML with the current CSS and JS paths
            this._view.webview.html = this._getHtmlForWebview(styleMainUri, scriptUri);
            
            // After refreshing the HTML, update the session end time
            setTimeout(() => {
                this.updateSessionTime();
            }, 500); // Small delay to ensure the webview is ready
        }
    }

    public dispose() {
        // No interval to clear here anymore, as it's now handled globally
    }

    private _getHtmlForWebview(styleUri: vscode.Uri, scriptUri: vscode.Uri) {
        // Read the HTML template file
        const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'webview.html');
        
        try {
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            
            // Replace the CSS and JS placeholders with the actual URIs
            htmlContent = htmlContent.replace('${styleUri}', styleUri.toString());
            htmlContent = htmlContent.replace('${scriptUri}', scriptUri.toString());
            
            return htmlContent;
        } catch (error) {
            console.error('Error loading webview HTML template:', error);
            
            // Fallback to a simple HTML if the template file is not found
            return `<!DOCTYPE html>
            <html>
              <head>
                <meta charset="UTF-8">
                <title>Cloud IDE</title>
              </head>
              <body>
                <div>
                  <p>Error loading webview template. Please check extension installation.</p>
                </div>
              </body>
            </html>`;
        }
    }
}

async function updateRunnerData(): Promise<void> {
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

export function registerCommands(context: vscode.ExtensionContext, provider: CloudIdeWebviewProvider) {
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
            }else{
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
                }else{
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
            
        }),

        vscode.commands.registerCommand('cloud-ide-extension.showInfo', async () => {
            // Show a modal information message
            vscode.window.showInformationMessage(
                'Contact help@revature.com for any issues related to the CDE. \n' +
                'Ted Balashov & Ashoka Shringla 2025.',
                { modal: true }
            );
        }),
        
        vscode.commands.registerCommand('cloud-ide-extension.openDevServer', async () => {
            
            const input = await vscode.window.showInputBox({
                placeHolder: 'Enter a number',
                prompt: 'Please enter your desired port number (such as 4200)',
                validateInput: (text) => {
                    // Validate that input contains only numbers
                    return /^\d+$/.test(text) ? null : 'Port must be a number.';
                }
            });
    
            if (input !== undefined) {
                const port = parseInt(input);
                
                try {
                    const response = await getDevServer(port);
                    const json = await response.json();
                    
                    await vscode.env.openExternal(vscode.Uri.parse(json.destination_url));
                    vscode.window.showInformationMessage(`Opened dev server on port ${port}`);
                } catch (error) {
                    console.error('Error opening dev server:', error);
                    vscode.window.showErrorMessage(`Failed to open dev server on port ${port}`);
                }
            }
        })
    );
}

export function deactivate() {
    // Make sure to clean up the interval when the extension is deactivated
    stopGlobalExpiryCheck();
}