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
import { TestRunner } from './testing/testRunner';

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
    private testRunner: TestRunner;
    private currentProjectInfo?: ProjectTestInfo;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.testDetectorService = new TestDetectorService();
        this.testRunner = new TestRunner();
    }

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
            async message => {
                switch (message.command) {
                    // Session management commands
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
                    
                    // Test management commands
                    case 'detectTests':
                        await this.detectTests();
                        return;
                    case 'refreshTests':
                        await this.detectTests();
                        return;
                    case 'runAllTests':
                        await this.runAllTests();
                        return;
                    case 'runTest':
                        await this.runSingleTest(message.testCase);
                        return;
                    case 'runTestClass':
                        await this.runTestClass(message.className);
                        return;
                }
            }
        );

        // Update session time when view is first loaded
        this.updateSessionTime();
        
        // Initialize test detection
        this.detectTests();
    }

    // Session Management Methods
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
            
            // After refreshing the HTML, update the session end time and test data
            setTimeout(() => {
                this.updateSessionTime();
                this.detectTests();
            }, 500);
        }
    }

    // Test Management Methods
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
            
            this.updateTestWebview({
                hasWorkspace: true,
                projectInfo: this.currentProjectInfo,
                isLoading: false
            });
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

    // Updated methods in src/extension.ts for real-time test status
    private async runAllTests() {
        if (!this.currentProjectInfo || !this.currentProjectInfo.hasTests) {
            vscode.window.showWarningMessage('No tests found to run');
            return;
        }
    
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
    
        // Notify that tests are starting - but keep test cases visible
        this.updateTestWebview({ isRunning: true });
    
        // Mark ALL tests as running in the UI
        if (this._view && this.currentProjectInfo) {
            this.currentProjectInfo.testCases.forEach(testCase => {
                this._view!.webview.postMessage({
                    command: 'testStarted',
                    testName: testCase.name
                });
            });
        }
    
        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }
    
            const command = detector.getRunAllCommand();
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            // Send completion updates for individual tests
            if (result.testResultsMap && this._view) {
                Object.entries(result.testResultsMap).forEach(([testName, status]) => {
                    this._view!.webview.postMessage({
                        command: 'testCompleted',
                        testName: testName,
                        status: status
                    });
                });
            }
            
            // Update with final results
            this.updateTestWebview({ 
                isRunning: false,
                lastResult: result
            });
    
            if (result.success) {
                vscode.window.showInformationMessage(
                    `✅ All tests passed! (${result.passed}/${result.totalTests})`
                );
            } else {
                vscode.window.showErrorMessage(
                    `❌ Tests failed! (${result.passed} passed, ${result.failed} failed)`
                );
            }
        } catch (error) {
            this.updateTestWebview({ isRunning: false });
            vscode.window.showErrorMessage(`Failed to run tests: ${error}`);
        }
    }
    
    private async runSingleTest(testCase: any) {
        if (!this.currentProjectInfo) return;
    
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
    
        // Notify that specific test is starting
        if (this._view) {
            this._view.webview.postMessage({
                command: 'testStarted',
                testName: testCase.name
            });
        }
    
        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }
    
            const command = detector.getRunSingleTestCommand(testCase);
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            // Send completion update for the specific test
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testCompleted',
                    testName: testCase.name,
                    status: result.success ? 'passed' : 'failed'
                });
            }
            
            // Update the webview with new results but keep it functional
            this.updateTestWebview({ 
                lastResult: result
            });
    
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Test ${testCase.name} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test ${testCase.name} failed!`);
            }
        } catch (error) {
            // Send failure notification
            if (this._view) {
                this._view.webview.postMessage({
                    command: 'testCompleted',
                    testName: testCase.name,
                    status: 'failed'
                });
            }
            
            vscode.window.showErrorMessage(`Failed to run test: ${error}`);
        }
    }
    
    private async runTestClass(className: string) {
        if (!this.currentProjectInfo) return;
    
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;
    
        // Mark all tests in the class as running
        if (this._view && this.currentProjectInfo) {
            const classTests = this.currentProjectInfo.testCases.filter(t => t.className === className);
            classTests.forEach(testCase => {
                this._view!.webview.postMessage({
                    command: 'testStarted',
                    testName: testCase.name
                });
            });
        }
    
        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }
    
            const command = detector.getRunClassCommand(className);
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            // Send completion updates for tests in the class
            if (this._view && this.currentProjectInfo) {
                const classTests = this.currentProjectInfo.testCases.filter(t => t.className === className);
                classTests.forEach(testCase => {
                    const status = result.testResultsMap[testCase.name] || 
                                  result.testResultsMap[`${className}#${testCase.name}`] || 
                                  (result.success ? 'passed' : 'failed');
                    
                    this._view!.webview.postMessage({
                        command: 'testCompleted',
                        testName: testCase.name,
                        status: status
                    });
                });
            }
            
            this.updateTestWebview({ 
                lastResult: result
            });
    
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Test class ${className} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test class ${className} failed!`);
            }
        } catch (error) {
            // Send failure notifications for all tests in the class
            if (this._view && this.currentProjectInfo) {
                const classTests = this.currentProjectInfo.testCases.filter(t => t.className === className);
                classTests.forEach(testCase => {
                    this._view!.webview.postMessage({
                        command: 'testCompleted',
                        testName: testCase.name,
                        status: 'failed'
                    });
                });
            }
            
            vscode.window.showErrorMessage(`Failed to run test class: ${error}`);
        }
    }

    private updateTestWebview(data: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateTestData',
                data: data
            });
        }
    }

    public dispose() {
        this.testRunner.dispose();
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
                <title>Cloud IDE Hub</title>
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