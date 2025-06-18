import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, runnerState, expiryNotificationTime } from './data';
import { registerSessionCommands, startGlobalExpiryCheck, stopGlobalExpiryCheck, updateRunnerData } from './session';
import { registerDevServerCommands } from './devserver';
import { registerAssistantCommands } from './assistant';
import { registerInfoCommands } from './info';
import { handleStartupFile } from './startup';
import { registerTestCommands } from './testing/testCommands';
import { TestDetectorService, ProjectTestInfo } from './testing/testDetector';
import { TestResultsGenerator } from './testing/testResultsGenerator';
import { TestRunner, TestRunOptions } from './testing/testRunner';
import { TestFileManager, TestRunResult } from './testing/testFileManager';

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
    registerTestCommands(context);

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

// Unified Webview Provider Implementation
class CloudIdeWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private testDetectorService: TestDetectorService;
    private testRunner?: TestRunner;
    private testFileManager?: TestFileManager;
    private currentProjectInfo?: ProjectTestInfo;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.testDetectorService = new TestDetectorService();
    }

    // REQUIRED: Implement the WebviewViewProvider interface
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getSessionEndTime':
                        this.updateSessionTime();
                        break;
                    case 'addTime':
                        vscode.commands.executeCommand('cloud-ide-extension.addTime', this);
                        break;
                    case 'openDevServer':
                        vscode.commands.executeCommand('cloud-ide-extension.openDevServer');
                        break;
                    case 'showInfo':
                        vscode.commands.executeCommand('cloud-ide-extension.showInfo');
                        break;
                    case 'detectTests':
                        await this.detectTests();
                        break;
                    case 'refreshTests':
                        await this.detectTests();
                        break;
                    case 'runAllTests':
                        await this.runAllTests();
                        break;
                    case 'runTest':
                        await this.runSingleTest(message.testCase);
                        break;
                    case 'runTestClass':
                        await this.runTestClass(message.className);
                        break;
                }
            }
        );

        // Initial load
        this.refresh();
    }

    public refresh() {
        this.updateSessionTime();
        this.detectTests();
    }

    public updateSessionTime() {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateSessionEndTime',
                sessionEndTime: runnerState.sessionEnd,
                expiryNotificationTime: expiryNotificationTime
            });
        }
    }

    private initializeTestRunner() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            this.testRunner = new TestRunner(workspacePath);
            this.testFileManager = this.testRunner.getTestFileManager();
        }
    }

    private async runAllTests() {
        if (!this.currentProjectInfo || !this.currentProjectInfo.hasTests) {
            vscode.window.showWarningMessage('No tests found to run');
            return;
        }

        if (!this.testRunner) {
            this.initializeTestRunner();
        }

        if (!this.testRunner) {
            vscode.window.showErrorMessage('Failed to initialize test runner');
            return;
        }

        // Notify webview that test run is starting
        this.updateTestWebview({
            command: 'testRunStarted',
            runType: 'all'
        });

        try {
            const options: TestRunOptions = { type: 'all' };
            const result = await this.testRunner.runTests(this.currentProjectInfo, options);
            
            // Get status changes for display
            const statusChanges = await this.testFileManager!.getTestStatusChanges();
            
            // Send detailed results to webview
            this.sendTestResults(result, statusChanges);
            
            // Show summary notification
            this.showTestCompletionNotification(result);
            
        } catch (error) {
            console.error('Test execution error:', error);
            vscode.window.showErrorMessage(`Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Notify webview that test run is completed
            this.updateTestWebview({
                command: 'testRunCompleted'
            });
        }
    }

    private async runSingleTest(testCase: any) {
        if (!this.currentProjectInfo || !this.testRunner) {
            return;
        }

        // Notify webview that test run is starting
        this.updateTestWebview({
            command: 'testRunStarted',
            runType: 'single',
            target: testCase.name
        });

        try {
            const options: TestRunOptions = { 
                type: 'single', 
                testCase: testCase 
            };
            const result = await this.testRunner.runTests(this.currentProjectInfo, options);
            
            // Get status changes for display
            const statusChanges = await this.testFileManager!.getTestStatusChanges();
            
            // Send detailed results to webview
            this.sendTestResults(result, statusChanges);
            
            // Show summary notification
            this.showTestCompletionNotification(result, `Test: ${testCase.name}`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run test: ${error}`);
        } finally {
            this.updateTestWebview({
                command: 'testRunCompleted'
            });
        }
    }

    private async runTestClass(className: string) {
        if (!this.currentProjectInfo || !this.testRunner) {
            return;
        }

        const shortClassName = className.split('.').pop();
        
        // Notify webview that test run is starting
        this.updateTestWebview({
            command: 'testRunStarted',
            runType: 'class',
            target: className
        });

        try {
            const options: TestRunOptions = { 
                type: 'class', 
                className: className 
            };
            const result = await this.testRunner.runTests(this.currentProjectInfo, options);
            
            // Get status changes for display
            const statusChanges = await this.testFileManager!.getTestStatusChanges();
            
            // Send detailed results to webview
            this.sendTestResults(result, statusChanges);
            
            // Show summary notification
            this.showTestCompletionNotification(result, `Class: ${shortClassName}`);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to run test class: ${error}`);
        } finally {
            this.updateTestWebview({
                command: 'testRunCompleted'
            });
        }
    }

    private sendTestResults(result: TestRunResult, statusChanges: any[]) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateTestResults',
                data: {
                    result: result,
                    statusChanges: statusChanges,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }

    private showTestCompletionNotification(result: TestRunResult, context?: string) {
        const contextText = context ? ` (${context})` : '';
        
        if (result.failed === 0) {
            vscode.window.showInformationMessage(
                `✅ All tests passed${contextText}! (${result.passed}/${result.total}) in ${(result.duration / 1000).toFixed(1)}s`
            );
        } else {
            // Show different messages based on what changed
            const failureMessage = result.passed > 0 
                ? `❌ Some tests failed${contextText}! (${result.passed} passed, ${result.failed} failed)`
                : `❌ All tests failed${contextText}! (${result.failed} failed)`;
            
            vscode.window.showErrorMessage(failureMessage);
        }
    }

    private async detectTests() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.updateTestWebview({
                hasWorkspace: false,
                projectInfo: undefined,
                isLoading: false
            });
            return;
        }

        this.updateTestWebview({ isLoading: true });

        try {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            this.currentProjectInfo = await this.testDetectorService.detectProjectTests(workspacePath);
            
            // Initialize test runner for this workspace
            this.initializeTestRunner();
            
            console.log(`Detected ${this.currentProjectInfo.methodCount} test methods in ${this.currentProjectInfo.classCount} test classes`);
            
            this.updateTestWebview({
                hasWorkspace: true,
                projectInfo: this.currentProjectInfo,
                isLoading: false
            });

            // Load existing test results if available
            if (this.testFileManager) {
                const lastResult = await this.testFileManager.loadTestResults();
                if (lastResult) {
                    const statusChanges = await this.testFileManager.getTestStatusChanges();
                    this.sendTestResults(lastResult, statusChanges);
                }
            }
            
        } catch (error) {
            console.error('Error detecting tests:', error);
            this.updateTestWebview({
                hasWorkspace: true,
                projectInfo: undefined,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private updateTestWebview(data: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: data.command || 'updateTestData',
                data: data
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the HTML template and CSS file paths
        const htmlPath = path.join(this._extensionUri.fsPath, 'resources', 'webview.html');
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'webview.js')
        );

        try {
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            
            // Replace placeholders
            htmlContent = htmlContent.replace(/\${styleUri}/g, styleUri.toString());
            htmlContent = htmlContent.replace(/\${scriptUri}/g, scriptUri.toString());
            
            return htmlContent;
        } catch (error) {
            console.error('Error loading webview HTML template:', error);
            return this._getFallbackHtml(webview);
        }
    }

    private _getFallbackHtml(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cloud IDE Hub</title>
            </head>
            <body style="color: var(--vscode-foreground); background-color: var(--vscode-editor-background); font-family: var(--vscode-font-family); padding: 20px;">
                <div>
                    <h3>Error Loading Cloud IDE Hub</h3>
                    <p>Could not load the webview HTML template. Please check that the resources/webview.html file exists.</p>
                </div>
            </body>
            </html>`;
    }

    // Add cleanup for old test results periodically
    private async cleanupOldTestResults() {
        if (this.testFileManager) {
            try {
                await this.testFileManager.cleanupOldResults();
            } catch (error) {
                console.error('Error cleaning up old test results:', error);
            }
        }
    }

    public dispose() {
        // Cleanup old results before disposing
        this.cleanupOldTestResults();
        
        if (this.testRunner) {
            // TestRunner doesn't have dispose method in the new version
            // but TestFileManager handles its own cleanup
        }
    }
}

export function deactivate() {
    // Make sure to clean up the interval when the extension is deactivated
    stopGlobalExpiryCheck();
}