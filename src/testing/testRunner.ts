// Enhanced testRunner.ts with terminal integration
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import * as crypto from 'crypto';
import { TestCase, ProjectTestInfo } from './testDetector';
import { TestFileManager, TestRunResult, TestDetail } from './testFileManager';

export interface TestRunOptions {
    type: 'all' | 'single' | 'class';
    testCase?: TestCase;
    className?: string;
    showTerminal?: boolean; // New option to control terminal visibility
}

export class TestRunner implements vscode.Disposable {
    private testFileManager: TestFileManager;
    private workspacePath: string;
    private terminal: vscode.Terminal | undefined;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.testFileManager = new TestFileManager(workspacePath);
    }

    async runTests(projectInfo: ProjectTestInfo, options: TestRunOptions): Promise<TestRunResult> {
        const runId = this.generateRunId();
        const startTime = Date.now();
        
        try {
            // Get the appropriate command
            const command = this.buildTestCommand(projectInfo, options);
            
            // Show user what's happening
            const statusBarMessage = vscode.window.setStatusBarMessage(
                `$(sync~spin) Running tests: ${this.getRunDescription(options)}...`
            );
            
            let output: string;
            
            // Execute with or without terminal based on options
            if (options.showTerminal !== false) { // Default to showing terminal
                output = await this.executeCommandWithTerminal(command, options);
            } else {
                output = await this.executeCommandSilent(command);
            }
            
            statusBarMessage.dispose();
            
            // Parse the test results
            const testDetails = await this.parseTestOutput(output, projectInfo, options);
            
            // Calculate summary
            const summary = this.calculateSummary(testDetails);
            
            // Create test results map
            const testResultsMap: { [key: string]: 'passed' | 'failed' | 'skipped' } = {};
            testDetails.forEach(test => {
                const fullKey = `${test.className}#${test.name}`;
                const shortKey = test.name;
                testResultsMap[fullKey] = test.status;
                testResultsMap[shortKey] = test.status;
            });
            
            const result: TestRunResult = {
                runId,
                timestamp: new Date(),
                runType: options.type,
                targetTest: options.testCase?.name,
                targetClass: options.className,
                passed: summary.passed,
                failed: summary.failed,
                skipped: summary.skipped,
                total: summary.total,
                duration: Date.now() - startTime,
                testDetails,
                testResultsMap,
                command,
                output
            };

            // Save results with change detection
            await this.testFileManager.saveTestResults(result);
            
            // Show completion notification
            this.showCompletionNotification(result, options);
            
            return result;

        } catch (error) {
            // Create error result with empty testResultsMap
            const errorResult: TestRunResult = {
                runId,
                timestamp: new Date(),
                runType: options.type,
                targetTest: options.testCase?.name,
                targetClass: options.className,
                passed: 0,
                failed: 0,
                skipped: 0,
                total: 0,
                duration: Date.now() - startTime,
                testDetails: [],
                testResultsMap: {},
                command: this.buildTestCommand(projectInfo, options),
                output: error instanceof Error ? error.message : String(error)
            };

            await this.testFileManager.saveTestResults(errorResult);
            
            // Show error in terminal if it was being used
            if (this.terminal && options.showTerminal !== false) {
                this.terminal.sendText(`echo "Test execution failed: ${error}"`);
            }
            
            vscode.window.showErrorMessage(`Test execution failed: ${error}`);
            throw error;
        }
    }

    private async executeCommandWithTerminal(command: string, options: TestRunOptions): Promise<string> {
        return new Promise((resolve, reject) => {
            // Create or reuse terminal
            if (!this.terminal) {
                this.terminal = vscode.window.createTerminal({
                    name: 'Cloud IDE Tests',
                    cwd: this.workspacePath
                });
            }

            // Show the terminal
            this.terminal.show();

            // Clear terminal and show what we're running
            this.terminal.sendText('clear');
            this.terminal.sendText(`echo "🧪 Running tests: ${this.getRunDescription(options)}"`);
            this.terminal.sendText(`echo "📁 Working directory: ${this.workspacePath}"`);
            this.terminal.sendText(`echo "⚡ Command: ${command}"`);
            this.terminal.sendText('echo "' + '='.repeat(60) + '"');

            // Execute the command in the terminal
            this.terminal.sendText(command);

            // Also capture output for parsing (run silently in background)
            exec(command, { 
                cwd: this.workspacePath,
                maxBuffer: 1024 * 1024 * 10,
                timeout: 300000 // 5 minute timeout
            }, (error, stdout, stderr) => {
                const output = stdout + stderr;
                
                // Send completion message to terminal
                if (error) {
                    this.terminal?.sendText(`echo "❌ Tests completed with errors (exit code: ${error.code})"`);
                    
                    // Still resolve if we got Maven output (tests can fail but still produce results)
                    if (output.includes('[INFO] BUILD') || output.includes('Tests run:')) {
                        resolve(output);
                    } else {
                        reject(new Error(`Command failed: ${error.message}\n${output}`));
                    }
                } else {
                    this.terminal?.sendText('echo "✅ Tests completed successfully"');
                    resolve(output);
                }
                
                this.terminal?.sendText('echo "' + '='.repeat(60) + '"');
            });
        });
    }

    private executeCommandSilent(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { 
                cwd: this.workspacePath,
                maxBuffer: 1024 * 1024 * 10,
                timeout: 300000 // 5 minute timeout
            }, (error, stdout, stderr) => {
                const output = stdout + stderr;
                
                if (error) {
                    // For Maven, non-zero exit code doesn't always mean error
                    if (output.includes('[INFO] BUILD SUCCESS') || 
                        output.includes('[INFO] BUILD FAILURE') ||
                        output.includes('Tests run:')) {
                        resolve(output);
                    } else {
                        reject(new Error(`Command failed: ${error.message}\n${output}`));
                    }
                } else {
                    resolve(output);
                }
            });
        });
    }

    private getRunDescription(options: TestRunOptions): string {
        switch (options.type) {
            case 'all':
                return 'All Tests';
            case 'single':
                return `${options.testCase?.name || 'Single Test'}`;
            case 'class':
                return `${options.className?.split('.').pop() || 'Test Class'}`;
            default:
                return 'Tests';
        }
    }

    private showCompletionNotification(result: TestRunResult, options: TestRunOptions): void {
        const description = this.getRunDescription(options);
        const duration = (result.duration / 1000).toFixed(1);
        
        if (result.failed === 0) {
            vscode.window.showInformationMessage(
                `✅ ${description} passed! (${result.passed}/${result.total}) in ${duration}s`
            );
        } else {
            const failureMsg = result.passed > 0 
                ? `❌ ${description}: ${result.passed} passed, ${result.failed} failed`
                : `❌ ${description}: All ${result.failed} tests failed`;
            
            vscode.window.showErrorMessage(failureMsg);
        }
    }

    // Add method to run tests with terminal (public interface)
    async runTestsWithTerminal(projectInfo: ProjectTestInfo, options: TestRunOptions): Promise<TestRunResult> {
        return this.runTests(projectInfo, { ...options, showTerminal: true });
    }

    // Add method to run tests silently (for background operations)
    async runTestsSilent(projectInfo: ProjectTestInfo, options: TestRunOptions): Promise<TestRunResult> {
        return this.runTests(projectInfo, { ...options, showTerminal: false });
    }

    private buildTestCommand(projectInfo: ProjectTestInfo, options: TestRunOptions): string {
        switch (projectInfo.projectType) {
            case 'java':
                return this.buildJavaCommand(options);
            default:
                throw new Error(`Unsupported project type: ${projectInfo.projectType}`);
        }
    }

    private buildJavaCommand(options: TestRunOptions): string {
        switch (options.type) {
            case 'all':
                return 'mvn test';
            case 'single':
                if (!options.testCase) {
                    throw new Error('Test case required for single test run');
                }
                return `mvn test -Dtest=${options.testCase.className}#${options.testCase.name}`;
            case 'class':
                if (!options.className) {
                    throw new Error('Class name required for class test run');
                }
                return `mvn test -Dtest=${options.className}`;
            default:
                throw new Error(`Unsupported run type: ${options.type}`);
        }
    }

    private async parseTestOutput(output: string, projectInfo: ProjectTestInfo, options: TestRunOptions): Promise<TestDetail[]> {
        switch (projectInfo.projectType) {
            case 'java':
                return this.parseJavaTestOutput(output, projectInfo, options);
            default:
                throw new Error(`Unsupported project type for parsing: ${projectInfo.projectType}`);
        }
    }

    private parseJavaTestOutput(output: string, projectInfo: ProjectTestInfo, options: TestRunOptions): TestDetail[] {
        const testDetails: TestDetail[] = [];
        const lines = output.split('\n');
        
        let currentClass = '';
        let inTestSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Detect start of test section
            if (line.includes('T E S T S') || line.includes('Running ')) {
                inTestSection = true;
            }
            
            // Look for test class being run
            if (line.startsWith('Running ')) {
                const classMatch = line.match(/Running (.+)/);
                if (classMatch) {
                    currentClass = classMatch[1];
                }
                continue;
            }
            
            // Parse individual test method results
            const testMethodMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]+)\)\s+Time elapsed:\s*([\d.]+)\s*sec(?:\s*<<<\s*(FAILURE|ERROR|SKIPPED))?/);
            if (testMethodMatch && inTestSection) {
                const [, methodName, className, durationStr, failureIndicator] = testMethodMatch;
                
                let status: 'passed' | 'failed' | 'skipped' = 'passed';
                if (failureIndicator === 'FAILURE' || failureIndicator === 'ERROR') {
                    status = 'failed';
                } else if (failureIndicator === 'SKIPPED') {
                    status = 'skipped';
                }
                
                testDetails.push({
                    name: methodName,
                    className: className || currentClass,
                    status,
                    duration: parseFloat(durationStr) * 1000
                });
                continue;
            }
            
            // Alternative parsing for summary-only output
            if (line.match(/Tests run:\s*\d+/) && testDetails.length === 0) {
                const summaryTests = this.inferTestDetailsFromSummary(output, projectInfo, options);
                testDetails.push(...summaryTests);
                break;
            }
        }
        
        return testDetails;
    }

    private inferTestDetailsFromSummary(output: string, projectInfo: ProjectTestInfo, options: TestRunOptions): TestDetail[] {
        const testDetails: TestDetail[] = [];
        const relevantTests = this.getRelevantTestCases(projectInfo, options);
        
        const summaryMatch = output.match(/Tests run: (\d+),\s*Failures: (\d+),\s*Errors: (\d+),\s*Skipped: (\d+)/);
        
        if (summaryMatch && relevantTests.length > 0) {
            const [, run, failures, errors, skipped] = summaryMatch;
            const totalFailed = parseInt(failures) + parseInt(errors);
            const totalSkipped = parseInt(skipped);
            const totalPassed = parseInt(run) - totalFailed - totalSkipped;
            
            let passedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;
            
            for (const testCase of relevantTests) {
                if (testCase.type !== 'method') continue;
                
                let status: 'passed' | 'failed' | 'skipped' = 'passed';
                
                if (skippedCount < totalSkipped) {
                    status = 'skipped';
                    skippedCount++;
                } else if (failedCount < totalFailed) {
                    status = 'failed';
                    failedCount++;
                } else if (passedCount < totalPassed) {
                    status = 'passed';
                    passedCount++;
                }
                
                testDetails.push({
                    name: testCase.name,
                    className: testCase.className,
                    status
                });
            }
        }
        
        return testDetails;
    }

    private getRelevantTestCases(projectInfo: ProjectTestInfo, options: TestRunOptions): TestCase[] {
        switch (options.type) {
            case 'all':
                return projectInfo.testCases.filter(tc => tc.type === 'method');
            case 'single':
                return options.testCase ? [options.testCase] : [];
            case 'class':
                return projectInfo.testCases.filter(tc => 
                    tc.type === 'method' && tc.className === options.className
                );
            default:
                return [];
        }
    }

    private calculateSummary(testDetails: TestDetail[]): { passed: number; failed: number; skipped: number; total: number } {
        const passed = testDetails.filter(t => t.status === 'passed').length;
        const failed = testDetails.filter(t => t.status === 'failed').length;
        const skipped = testDetails.filter(t => t.status === 'skipped').length;
        
        return { passed, failed, skipped, total: testDetails.length };
    }

    private generateRunId(): string {
        return crypto.randomBytes(8).toString('hex');
    }

    async getLastResult(): Promise<TestRunResult | undefined> {
        return await this.testFileManager.loadTestResults();
    }

    getTestFileManager(): TestFileManager {
        return this.testFileManager;
    }

    dispose(): void {
        if (this.terminal) {
            this.terminal.dispose();
        }
    }
}