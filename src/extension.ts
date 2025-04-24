import * as vscode from 'vscode';
import { getConfig, runner } from './data';
import { getDevServer, getRunnerInfo } from './api';

export function activate(context: vscode.ExtensionContext) {
    // Create and register webview panel provider
    const provider = new CloudIdeWebviewProvider(context.extensionUri);
    
    // Register the webview
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('cloudIdeWebview', provider)
    );

    // Register commands
    registerCommands(context, provider);

    getConfig();

    getRunnerInfo()
    .then(response => response.json())
    .then(json => { 
        runner.session_end = json.session_end;
        runner.session_start = json.session_start;
        runner.user_id = json.user_id;
        console.log("Got runner data:"+runner)
    })

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
                }
            }
        );
    }

    public refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview();
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
                <p>This session will end in:</p>
                <br>
                <button class="button" id="addTimeBtn">Add Time</button>
                
                <h3>Dev Servers</h3>
                <div class="item-with-button">
                    <span>localhost:4200</span>
                    <button class="button" id="openDevServerBtn">Open</button>
                </div>
                
                <div class="item-with-button">
                    <h3>Info</h3>
                    <button class="button" id="showInfoBtn">View</button>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    
                    // Add log to show script is running
                    console.log('Webview script initialized');
                    
                    document.getElementById('addTimeBtn').addEventListener('click', () => {
                        console.log('Add time button clicked');
                        vscode.postMessage({
                            command: 'addTime'
                        });
                    });

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

export function registerCommands(context: vscode.ExtensionContext, provider: CloudIdeWebviewProvider) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.addTime', async () => {
            provider.refresh();
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
            let monolith : string = getConfig().monolithUrl
            vscode.window.showInformationMessage(monolith)
            
            // Open the URL in the default external browser
    
            let url = getDevServer().then(response => response.json())
            .then(json => { 
                vscode.env.openExternal(json.destination_url).then();
              }
            )
          })
    );
}

export function deactivate() {}