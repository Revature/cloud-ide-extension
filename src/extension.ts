import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, runnerState, expiryNotificationTime } from './data';
import { registerSessionCommands, startGlobalExpiryCheck, stopGlobalExpiryCheck, updateRunnerData } from './session';
import { registerDevServerCommands } from './devserver';
import { registerAssistantCommands } from './assistant';
import { registerInfoCommands } from './info';
import { handleStartupFile } from './startup';

export async function activate(context: vscode.ExtensionContext) {
    // Create and register webview panel provider
    const provider = new CloudIdeWebviewProvider(context.extensionUri);
    
    // Register the webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cloudIdeWebview', provider)
    );

    // Register all commands from different modules
    registerSessionCommands(context, provider);
    registerDevServerCommands(context);
    registerAssistantCommands(context);
    registerInfoCommands(context);

    getConfig();

    // Get initial runner info 
    await updateRunnerData();
    provider.refresh();

    // Handle startup file opening
    await handleStartupFile();

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

// Webview Provider Implementation (your existing sidebar webview)
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

export function deactivate() {
    // Make sure to clean up the interval when the extension is deactivated
    stopGlobalExpiryCheck();
}