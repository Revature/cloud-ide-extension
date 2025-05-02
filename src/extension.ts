import * as vscode from 'vscode';
import { getConfig, runner } from './data';
import { addTime, getDevServer, getRunnerInfo } from './api';

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

    // Get initial runner info and then refresh the webview
    await updateRunnerData();
    provider.refresh();
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

        // Set the webview's html content
        webviewView.webview.html = this._getHtmlForWebview();

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                // Log the message for debugging
                console.log('Received message:', message);
                
                switch (message.command) {
                    case 'openDevServer':
                        console.log('Executing openDevServer command');
                        vscode.commands.executeCommand('cloud-ide-extension.openDevServer');
                        return;
                    case 'showInfo':
                        console.log('Executing showInfo command');
                        vscode.commands.executeCommand('cloud-ide-extension.showInfo');
                        return;
                    case 'addTime':
                        console.log('Executing addTime command');
                        vscode.commands.executeCommand('cloud-ide-extension.addTime', this);
                        return;
                    case 'getSessionEndTime':
                        console.log('Sending session end time');
                        this._view?.webview.postMessage({
                            command: 'updateSessionEndTime',
                            sessionEndTime: runner.session_end
                        });
                        return;
                }
            }
        );
    }

    public refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview();
            
            // After refreshing the HTML, update the session end time
            setTimeout(() => {
                this._view?.webview.postMessage({
                    command: 'updateSessionEndTime',
                    sessionEndTime: runner.session_end
                });
            }, 500); // Small delay to ensure the webview is ready
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cloud IDE</title>
            <style>
                body {
                    padding: 10px;
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                }
                .item-with-button {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin: 8px 0;
                }
                .button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 8px;
                    cursor: pointer;
                    border-radius: 2px;
                }
                .button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div>
                <h3>Session Management</h3>
                <div id="countdown" class="countdown">Loading...</div>
                
                <h3>Browser</h3>
                <div class="item-with-button">
                    <button class="button" id="openDevServerBtn">Open in browser...</button>
                </div>
                
                <div class="item-with-button">
                    <h3>Info</h3>
                    <button class="button" id="showInfoBtn">View</button>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let countdownInterval;
                    let sessionEndTime;
                    
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
                        
                        if (timeRemaining <= 0) {
                            document.getElementById('countdown').textContent = 'Session expired!';
                            document.getElementById('countdown').classList.add('warning');
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
                        
                        document.getElementById('countdown').textContent = "Session will end in:" + formattedTime;
                    }

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
                }());
            </script>
        </body>
        </html>`;
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
        runner.session_end = localSessionEnd;
        runner.session_start = localSessionStart;
        runner.user_id = json.user_id;
        
        return Promise.resolve();
    } catch (error) {
        console.error('Error updating runner data:', error);
        return Promise.reject(error);
    }
}

export function registerCommands(context: vscode.ExtensionContext, provider: CloudIdeWebviewProvider) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.addTime', async (webviewProvider) => {
            try {
                const response = await addTime(5);
                const json = await response.json();
                console.log('Add time response:', json);
                
                await updateRunnerData();
                
                console.log('Updated runner data:', JSON.stringify(runner));
                
                // Refresh the webview to show the updated time
                if (webviewProvider) {
                    webviewProvider.refresh();
                } else if (provider) {
                    provider.refresh();
                }
                
                // Show confirmation to the user
                vscode.window.showInformationMessage('Successfully added 5 minutes to your session.');
            } catch (error) {
                console.error('Error adding time:', error);
                vscode.window.showErrorMessage('Failed to add time to your session.');
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
                    console.log('Dev server response:', json);
                    
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

export function deactivate() {}