// src/testing/testWebviewProvider.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestDetectorService, ProjectTestInfo, TestCase } from './testDetector';
import { TestRunner, TestRunResult } from './testRunner';

export class TestWebviewProvider implements vscode.WebviewViewProvider {
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

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'detectTests':
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
                    case 'refresh':
                        await this.refresh();
                        break;
                }
            }
        );

        // Initial load
        this.refresh();
    }

    async refresh() {
        await this.detectTests();
    }

    private async detectTests() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.updateWebview({
                hasWorkspace: false,
                projectInfo: undefined,
                isLoading: false
            });
            return;
        }

        this.updateWebview({ isLoading: true });

        try {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            this.currentProjectInfo = await this.testDetectorService.detectProjectTests(workspacePath);
            
            this.updateWebview({
                hasWorkspace: true,
                projectInfo: this.currentProjectInfo,
                isLoading: false
            });
        } catch (error) {
            console.error('Error detecting tests:', error);
            this.updateWebview({
                hasWorkspace: true,
                projectInfo: undefined,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async runAllTests() {
        if (!this.currentProjectInfo || !this.currentProjectInfo.hasTests) {
            vscode.window.showWarningMessage('No tests found to run');
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        this.updateWebview({ isRunning: true });

        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }

            const command = detector.getRunAllCommand();
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            this.updateWebview({ 
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
            this.updateWebview({ isRunning: false });
            vscode.window.showErrorMessage(`Failed to run tests: ${error}`);
        }
    }

    private async runSingleTest(testCase: TestCase) {
        if (!this.currentProjectInfo) return;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        this.updateWebview({ isRunning: true });

        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }

            const command = detector.getRunSingleTestCommand(testCase);
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            this.updateWebview({ 
                isRunning: false,
                lastResult: result
            });

            if (result.success) {
                vscode.window.showInformationMessage(`✅ Test ${testCase.name} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test ${testCase.name} failed!`);
            }
        } catch (error) {
            this.updateWebview({ isRunning: false });
            vscode.window.showErrorMessage(`Failed to run test: ${error}`);
        }
    }

    private async runTestClass(className: string) {
        if (!this.currentProjectInfo) return;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        this.updateWebview({ isRunning: true });

        try {
            const detector = this.testDetectorService.getDetectorForProject(this.currentProjectInfo.projectType);
            if (!detector) {
                throw new Error(`No test runner available for ${this.currentProjectInfo.projectType} projects`);
            }

            const command = detector.getRunClassCommand(className);
            const result = await this.testRunner.runTests(command, workspaceFolders[0].uri.fsPath);
            
            this.updateWebview({ 
                isRunning: false,
                lastResult: result
            });

            if (result.success) {
                vscode.window.showInformationMessage(`✅ Test class ${className} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test class ${className} failed!`);
            }
        } catch (error) {
            this.updateWebview({ isRunning: false });
            vscode.window.showErrorMessage(`Failed to run test class: ${error}`);
        }
    }

    private updateWebview(data: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateTestData',
                data: data
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
        );
        
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'resources', 'test-webview.js')
        );

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Test Runner</title>
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>
                <div class="container">
                    <!-- Header Section -->
                    <div class="section">
                        <div class="section-title">Test Runner</div>
                        <div class="test-header">
                            <button class="button" id="refreshBtn">🔄 Refresh</button>
                            <button class="button" id="runAllBtn" disabled>▶️ Run All Tests</button>
                        </div>
                    </div>

                    <!-- Loading State -->
                    <div class="section" id="loadingSection" style="display: none;">
                        <div class="loading-spinner">🔄 Detecting tests...</div>
                    </div>

                    <!-- Running State -->
                    <div class="section" id="runningSection" style="display: none;">
                        <div class="loading-spinner">⚡ Running tests...</div>
                    </div>

                    <!-- No Workspace State -->
                    <div class="section" id="noWorkspaceSection" style="display: none;">
                        <div class="no-tests">
                            <div class="no-tests-icon">📁</div>
                            <div class="no-tests-title">No workspace found</div>
                            <div class="no-tests-subtitle">Open a folder to detect tests</div>
                        </div>
                    </div>

                    <!-- No Tests State -->
                    <div class="section" id="noTestsSection" style="display: none;">
                        <div class="no-tests">
                            <div class="no-tests-icon">🧪</div>
                            <div class="no-tests-title">No tests found</div>
                            <div class="no-tests-subtitle" id="noTestsMessage">
                                No test files detected in the current workspace
                            </div>
                        </div>
                    </div>

                    <!-- Project Info Section -->
                    <div class="section" id="projectInfoSection" style="display: none;">
                        <div class="project-info">
                            <div class="info-item">
                                <strong>Project Type:</strong> <span id="projectType"></span>
                            </div>
                            <div class="info-item">
                                <strong>Test Framework:</strong> <span id="testFramework"></span>
                            </div>
                            <div class="info-item">
                                <strong>Total Tests:</strong> <span id="totalTests"></span>
                            </div>
                        </div>
                    </div>

                    <!-- Test Results Section -->
                    <div class="section" id="resultsSection" style="display: none;">
                        <div class="section-title">Last Test Results</div>
                        <div class="test-results" id="testResults"></div>
                    </div>

                    <!-- Test Cases Section -->
                    <div class="section" id="testCasesSection" style="display: none;">
                        <div class="section-title">Test Cases</div>
                        <div class="test-cases" id="testCasesList"></div>
                    </div>

                    <!-- Error Section -->
                    <div class="section" id="errorSection" style="display: none;">
                        <div class="error-message">
                            <div class="error-icon">❌</div>
                            <div class="error-text" id="errorText"></div>
                        </div>
                    </div>
                </div>

                <script src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    dispose() {
        this.testRunner.dispose();
    }
}