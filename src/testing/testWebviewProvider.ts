// src/testing/testWebviewProvider.ts - Fixed version
import * as vscode from 'vscode';
import { TestDetectorService, ProjectTestInfo, TestCase } from './testDetector';
import { TestRunner, TestRunOptions } from './testRunner';
import { TestRunResult, TestFileManager } from './testFileManager';

export class TestWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private testDetectorService: TestDetectorService;
    private testRunner?: TestRunner;
    private testFileManager?: TestFileManager;
    private currentProjectInfo?: ProjectTestInfo;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this.testDetectorService = new TestDetectorService();
    }

    private initializeTestRunner() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            this.testRunner = new TestRunner(workspacePath);
            this.testFileManager = this.testRunner.getTestFileManager();
        }
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
            
            // Initialize test runner for this workspace
            this.initializeTestRunner();
            
            this.updateWebview({
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

        if (!this.testRunner) {
            this.initializeTestRunner();
        }

        if (!this.testRunner) {
            vscode.window.showErrorMessage('Failed to initialize test runner');
            return;
        }

        this.updateWebview({ isRunning: true });

        try {
            const options: TestRunOptions = { type: 'all' };
            const result = await this.testRunner.runTests(this.currentProjectInfo, options);
            
            // Get status changes for display
            const statusChanges = await this.testFileManager!.getTestStatusChanges();
            
            // Send detailed results to webview
            this.sendTestResults(result, statusChanges);
            
            this.updateWebview({ 
                isRunning: false,
                lastResult: result
            });

            if (result.failed === 0) {
                vscode.window.showInformationMessage(
                    `✅ All tests passed! (${result.passed}/${result.total}) in ${(result.duration / 1000).toFixed(1)}s`
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
        if (!this.currentProjectInfo || !this.testRunner) {
            return;
        }

        this.updateWebview({ isRunning: true });

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
            
            this.updateWebview({ 
                isRunning: false,
                lastResult: result
            });

            if (result.failed === 0) {
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
        if (!this.currentProjectInfo || !this.testRunner) {
            return;
        }

        this.updateWebview({ isRunning: true });

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
            
            this.updateWebview({ 
                isRunning: false,
                lastResult: result
            });

            const shortClassName = className.split('.').pop();
            if (result.failed === 0) {
                vscode.window.showInformationMessage(`✅ Test class ${shortClassName} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test class ${shortClassName} failed!`);
            }
        } catch (error) {
            this.updateWebview({ isRunning: false });
            vscode.window.showErrorMessage(`Failed to run test class: ${error}`);
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

    private updateWebview(data: any) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateTestData',
                data: data
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        // Try to get resource URIs, but fall back to inline styles/scripts if they fail
        let styleUri: string;
        let scriptContent: string;

        try {
            styleUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'resources', 'styling.css')
            ).toString();
        } catch (error) {
            console.warn('Could not create style URI, using inline styles');
            styleUri = '';
        }

        // Inline the JavaScript to avoid URI issues
        scriptContent = this._getInlineScript();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Test Runner</title>
                ${styleUri ? `<link rel="stylesheet" href="${styleUri}">` : this._getInlineStyles()}
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

                <script>
                    ${scriptContent}
                </script>
            </body>
            </html>`;
    }

    private _getInlineStyles(): string {
        return `<style>
            body { padding: 10px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; font-size: 11px; }
            .section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin-bottom: 12px; padding: 8px; background-color: var(--vscode-editor-background); }
            .section-title { font-size: 10px; font-weight: bold; text-transform: uppercase; color: var(--vscode-descriptionForeground); margin: 0 0 6px 0; padding-bottom: 4px; border-bottom: 1px solid var(--vscode-panel-border); letter-spacing: 0.5px; }
            .button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 3px 8px; cursor: pointer; border-radius: 2px; font-size: 11px; }
            .button:hover { background-color: var(--vscode-button-hoverBackground); }
            .button:disabled { opacity: 0.6; cursor: not-allowed; }
            .test-header { display: flex; gap: 8px; margin-bottom: 8px; }
            .test-header .button { flex: 1; font-size: 10px; padding: 4px 8px; }
            .loading-spinner { text-align: center; padding: 16px; color: var(--vscode-descriptionForeground); font-style: italic; }
            .no-tests { text-align: center; padding: 24px 16px; color: var(--vscode-descriptionForeground); }
            .no-tests-icon { font-size: 32px; margin-bottom: 12px; }
            .no-tests-title { font-size: 12px; font-weight: bold; margin-bottom: 6px; color: var(--vscode-foreground); }
            .no-tests-subtitle { font-size: 10px; line-height: 1.4; }
            .project-info { background-color: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; }
            .info-item { font-size: 10px; margin-bottom: 4px; display: flex; justify-content: space-between; }
            .error-message { text-align: center; padding: 16px; color: var(--vscode-errorForeground); background-color: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); border-radius: 4px; }
        </style>`;
    }

    private _getInlineScript(): string {
        return `
            (function() {
                const vscode = acquireVsCodeApi();
                let currentData = {};

                const refreshBtn = document.getElementById('refreshBtn');
                const runAllBtn = document.getElementById('runAllBtn');
                
                refreshBtn.addEventListener('click', () => {
                    vscode.postMessage({ command: 'refresh' });
                });

                runAllBtn.addEventListener('click', () => {
                    vscode.postMessage({ command: 'runAllTests' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.command === 'updateTestData') {
                        currentData = message.data;
                        updateUI();
                    }
                });

                function updateUI() {
                    // Simple UI update logic
                    const sections = ['loadingSection', 'runningSection', 'noWorkspaceSection', 'noTestsSection', 'projectInfoSection', 'resultsSection', 'testCasesSection', 'errorSection'];
                    sections.forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = 'none';
                    });

                    refreshBtn.disabled = false;
                    runAllBtn.disabled = true;

                    if (currentData.isLoading) {
                        document.getElementById('loadingSection').style.display = 'block';
                        refreshBtn.disabled = true;
                        return;
                    }

                    if (currentData.isRunning) {
                        document.getElementById('runningSection').style.display = 'block';
                        refreshBtn.disabled = true;
                        return;
                    }

                    if (currentData.error) {
                        document.getElementById('errorSection').style.display = 'block';
                        document.getElementById('errorText').textContent = currentData.error;
                        return;
                    }

                    if (!currentData.hasWorkspace) {
                        document.getElementById('noWorkspaceSection').style.display = 'block';
                        return;
                    }

                    if (!currentData.projectInfo || !currentData.projectInfo.hasTests) {
                        document.getElementById('noTestsSection').style.display = 'block';
                        const msg = currentData.projectInfo ? 
                            'No test cases found for ' + currentData.projectInfo.projectType + ' project' :
                            'Project type not supported';
                        document.getElementById('noTestsMessage').textContent = msg;
                        return;
                    }

                    document.getElementById('projectInfoSection').style.display = 'block';
                    document.getElementById('projectType').textContent = currentData.projectInfo.projectType.toUpperCase();
                    document.getElementById('testFramework').textContent = currentData.projectInfo.testFramework;
                    // Fixed: Use methodCount instead of testCases.length
                    document.getElementById('totalTests').textContent = currentData.projectInfo.methodCount || 0;
                    runAllBtn.disabled = false;
                }

                // Initial load
                vscode.postMessage({ command: 'detectTests' });
            })();
        `;
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
        this.cleanupOldTestResults();
        // TestRunner dispose will be called automatically by vscode
    }
}