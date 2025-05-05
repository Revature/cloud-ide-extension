import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, runner, expiry_notification_time } from './data';
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

    // Make sure to dispose the provider when the extension is deactivated
    context.subscriptions.push({
        dispose: () => {
            provider.dispose();
        }
    });
}


// Webview Provider Implementation
class CloudIdeWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _expiryCheckInterval?: NodeJS.Timeout;

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
                this._view?.webview.postMessage({
                    command: 'updateSessionEndTime',
                    sessionEndTime: runner.session_end
                });
            }, 500); // Small delay to ensure the webview is ready
        }
    }

    public dispose() {
        if (this._expiryCheckInterval) {
            clearInterval(this._expiryCheckInterval);
            this._expiryCheckInterval = undefined;
        }
    }

    // Start checking for session expiry
    private startExpiryCheck() {
        // Clear any existing interval
        if (this._expiryCheckInterval) {
            clearInterval(this._expiryCheckInterval);
        }

        // Check every 30 seconds
        this._expiryCheckInterval = setInterval(() => {
            this.checkSessionExpiry();
        }, 30000); // 30 seconds
        
        // Do an initial check right away
        this.checkSessionExpiry();
    }

    // Check if the session is about to expire
    private checkSessionExpiry() {
        if (!runner.session_end) {
            return; // No session end time available yet
        }

        const now = new Date();
        const sessionEnd = new Date(runner.session_end);
        
        // Calculate minutes remaining
        const minutesRemaining = (sessionEnd.getTime() - now.getTime()) / (1000 * 60);
        
        // Show notification if less than expiry_notification_time minutes remaining
        // but more than 0 minutes (not expired yet)
        if (minutesRemaining > 0 && minutesRemaining < expiry_notification_time) {
            // Round the minutes for display
            const roundedMinutes = Math.ceil(minutesRemaining);
            
            vscode.window.showWarningMessage(
                `Your session will expire in ${roundedMinutes} minute${roundedMinutes === 1 ? '' : 's'}. ` +
                'Please add more time if needed.',
                'Add 5 Minutes'
            ).then(selection => {
                if (selection === 'Add 5 Minutes') {
                    vscode.commands.executeCommand('cloud-ide-extension.addTime', this);
                }
            });
        }
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
                const response = await addTime(60);
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