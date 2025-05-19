import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runnerState } from './data';
import { OpenAIService } from './openai';

// Right Side Panel Webview class
class RightSidePanelWebview {
    private static currentPanel: RightSidePanelWebview | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _currentEditorContent: string = '';
    private _currentFileName: string = '';
    private _apiResponse: string = '';
    private _isLoading: boolean = false;
    private _hasAnalyzed: boolean = false;
    private _openaiService: OpenAIService;

    public static createOrShow(extensionUri: vscode.Uri) {
        // If we already have a panel, show it.
        if (RightSidePanelWebview.currentPanel) {
            RightSidePanelWebview.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Otherwise, create a new panel in the right side.
        const panel = vscode.window.createWebviewPanel(
            'cloudIdeRightPanel',
            'AI Assistant',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        RightSidePanelWebview.currentPanel = new RightSidePanelWebview(panel, extensionUri);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        RightSidePanelWebview.currentPanel = new RightSidePanelWebview(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Initialize OpenAI service with hardcoded API key
        const apiKey = 'YOUR_API_KEY_HERE'; // Replace with your actual API key
        this._openaiService = new OpenAIService(apiKey);
        this._openaiService.loadSystemPrompt(extensionUri.fsPath);

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Listen for active editor changes to update the current content
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                // Only update if the active editor is actually a text editor, not the webview
                if (editor && editor.document) {
                    this.updateCurrentEditorContent();
                }
                // If editor is undefined or doesn't have a document, it might be the webview
                // In that case, we don't want to clear our state
            })
        );

        // Listen for text document changes to update content in real-time
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && event.document === activeEditor.document) {
                    this.updateCurrentEditorContent();
                }
            })
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'analyzeWithAI':
                        this.analyzeWithOpenAI();
                        return;
                    case 'copyResponse':
                        if (this._apiResponse) {
                            vscode.env.clipboard.writeText(this._apiResponse);
                            vscode.window.showInformationMessage('AI response copied to clipboard');
                        }
                        return;
                    case 'requestInitialState':
                        this.sendStateToWebview();
                        return;
                }
            },
            null,
            this._disposables
        );

        // Initialize current editor content and send initial state
        this.updateCurrentEditorContent();
    }

    public dispose() {
        RightSidePanelWebview.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private updateCurrentEditorContent() {
        const activeEditor = vscode.window.activeTextEditor;
        
        // Only update if we have a valid text editor
        if (activeEditor && activeEditor.document) {
            const newContent = activeEditor.document.getText();
            const newFileName = activeEditor.document.fileName;
            
            // Check if we're switching to a different file
            const isDifferentFile = this._currentFileName && newFileName !== this._currentFileName;
            
            // Update content
            this._currentEditorContent = newContent;
            this._currentFileName = newFileName;
            
            // Only reset AI state when switching to a different file, not when editing the same file
            if (isDifferentFile) {
                this._apiResponse = '';
                this._hasAnalyzed = false;
                this._isLoading = false;
            }
        } else if (!activeEditor) {
            // Only clear if there's truly no editor (not just switching to webview)
            // We'll be more conservative and not clear immediately
            const wasEmpty = this._currentEditorContent === '';
            if (!wasEmpty) {
                // Don't clear immediately - the user might just be clicking in the webview
                // Keep the current content and state
                return;
            }
        }

        // Send updated state to webview
        this.sendStateToWebview();
    }

    private async analyzeWithOpenAI() {
        if (!this._currentEditorContent.trim()) {
            vscode.window.showWarningMessage('No code content to analyze');
            return;
        }

        // Set loading state
        this._isLoading = true;
        this.sendStateToWebview();

        try {
            this._apiResponse = await this._openaiService.analyzeCode(this._currentEditorContent);
            this._hasAnalyzed = true;
        } catch (error) {
            console.error('OpenAI API Error:', error);
            this._apiResponse = `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
            this._hasAnalyzed = true;
            vscode.window.showErrorMessage(`AI Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            this._isLoading = false;
            this.sendStateToWebview();
        }
    }

    private sendStateToWebview() {
        const hasContent = this._currentEditorContent.length > 0;

        this._panel.webview.postMessage({
            command: 'updateState',
            data: {
                hasContent,
                apiResponse: this._apiResponse,
                isLoading: this._isLoading,
                hasAnalyzed: this._hasAnalyzed
            }
        });
    }

    public updateSessionData() {
        if (this._panel) {
            this._panel.webview.postMessage({
                command: 'updateSessionData',
                sessionEndTime: runnerState.sessionEnd
            });
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the HTML template and CSS file paths
        const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'assistant.html');
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'assistant.js')
        );

        try {
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            
            // Replace placeholders
            htmlContent = htmlContent.replace(/\${styleUri}/g, styleUri.toString());
            htmlContent = htmlContent.replace(/\${scriptUri}/g, scriptUri.toString());
            
            return htmlContent;
        } catch (error) {
            console.error('Error loading assistant HTML template:', error);
            return this._getFallbackHtml(webview);
        }
    }

    private _getFallbackHtml(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Assistant</title>
            </head>
            <body style="color: var(--vscode-foreground); background-color: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px;">
                <div>
                    <h3>Error Loading Assistant Panel</h3>
                    <p>Could not load the assistant HTML template. Please check that the resources/assistant.html file exists.</p>
                </div>
            </body>
            </html>`;
    }
}

export function registerAssistantCommands(context: vscode.ExtensionContext) {
    // Register the new command to open webview in right side panel
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.openRightPanel', () => {
            RightSidePanelWebview.createOrShow(context.extensionUri);
        })
    );
}