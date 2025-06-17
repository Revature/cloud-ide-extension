// src/testing/testRunner.ts - Enhanced version
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
}

export class TestRunner {
    private testFileManager: TestFileManager;
    private workspacePath: string;

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
            
            // Execute the test command
            const output = await this.executeCommand(command);
            
            // Parse the test results
            const testDetails = await this.parseTestOutput(output, projectInfo, options);
            
            // Calculate summary
            const summary = this.calculateSummary(testDetails);
            
            const result: TestRunResult = {
                runId,
                timestamp: new Date(),
                runType: options.type,
                targetTest: options.testCase?.name,
                targetClass: options.className,
                ...summary,
                duration: Date.now() - startTime,
                testDetails,
                command,
                output
            };

            // Save results with change detection
            await this.testFileManager.saveTestResults(result);
            
            // Show status changes notification
            await this.notifyStatusChanges(result);
            
            return result;

        } catch (error) {
            // Create error result
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
                command: this.buildTestCommand(projectInfo, options),
                output: error instanceof Error ? error.message : String(error)
            };

            await this.testFileManager.saveTestResults(errorResult);
            throw error;
        }
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

    private executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            exec(command, { 
                cwd: this.workspacePath,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            }, (error, stdout, stderr) => {
                const output = stdout + stderr;
                
                if (error) {
                    // For Maven, non-zero exit code doesn't always mean error
                    // Tests can fail but Maven still produces valid output
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

    private async parseTestOutput(output: string, projectInfo: ProjectTestInfo, options: TestRunOptions): Promise<TestDetail[]> {
        const testDetails: TestDetail[] = [];
        
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
        
        // Parse Maven Surefire output
        let inTestResults = false;
        let currentClass = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Look for test class being run
            if (line.includes('Running ')) {
                const classMatch = line.match(/Running (.+)/);
                if (classMatch) {
                    currentClass = classMatch[1];
                }
                continue;
            }
            
            // Look for individual test results
            if (line.includes('Test ') && (line.includes('PASSED') || line.includes('FAILED') || line.includes('SKIPPED'))) {
                const testDetail = this.parseTestLine(line, currentClass);
                if (testDetail) {
                    testDetails.push(testDetail);
                }
                continue;
            }
            
            // Alternative parsing for different Maven output formats
            if (line.match(/^\s*\w+\(\w+\)\s+Time elapsed:/)) {
                const testDetail = this.parseAlternativeTestLine(line, currentClass);
                if (testDetail) {
                    testDetails.push(testDetail);
                }
                continue;
            }
        }
        
        // If no individual test details found, try to infer from summary
        if (testDetails.length === 0) {
            testDetails.push(...this.inferTestDetailsFromSummary(output, projectInfo, options));
        }
        
        return testDetails;
    }

    private parseTestLine(line: string, currentClass: string): TestDetail | null {
        // Parse line like: "Test methodName PASSED" or "Test methodName FAILED"
        const match = line.match(/Test (\w+) (PASSED|FAILED|SKIPPED)/);
        if (!match) return null;
        
        const [, methodName, statusStr] = match;
        const status = statusStr.toLowerCase() as 'passed' | 'failed' | 'skipped';
        
        return {
            name: methodName,
            className: currentClass,
            status,
            duration: this.extractDuration(line)
        };
    }

    private parseAlternativeTestLine(line: string, currentClass: string): TestDetail | null {
        // Parse line like: "testMethod(ClassName)  Time elapsed: 0.001 s"
        const match = line.match(/(\w+)\((\w+)\)\s+Time elapsed: ([\d.]+)/);
        if (!match) return null;
        
        const [, methodName, className, durationStr] = match;
        
        // Determine status based on surrounding context or default to passed
        let status: 'passed' | 'failed' | 'skipped' = 'passed';
        if (line.includes('FAILURE') || line.includes('ERROR')) {
            status = 'failed';
        } else if (line.includes('SKIPPED')) {
            status = 'skipped';
        }
        
        return {
            name: methodName,
            className: className,
            status,
            duration: parseFloat(durationStr) * 1000 // Convert to milliseconds
        };
    }

    private inferTestDetailsFromSummary(output: string, projectInfo: ProjectTestInfo, options: TestRunOptions): TestDetail[] {
        const testDetails: TestDetail[] = [];
        
        // Get all test methods that should have been run
        const relevantTests = this.getRelevantTestCases(projectInfo, options);
        
        // Parse summary line like "Tests run: 1, Failures: 0, Errors: 0, Skipped: 0"
        const summaryMatch = output.match(/Tests run: (\d+),\s*Failures: (\d+),\s*Errors: (\d+),\s*Skipped: (\d+)/);
        
        if (summaryMatch && relevantTests.length > 0) {
            const [, run, failures, errors, skipped] = summaryMatch;
            const totalRun = parseInt(run);
            const totalFailed = parseInt(failures) + parseInt(errors);
            const totalSkipped = parseInt(skipped);
            const totalPassed = totalRun - totalFailed - totalSkipped;
            
            // If we have exactly the right number of tests, we can make educated guesses
            if (totalRun === relevantTests.length) {
                let passedCount = 0;
                let failedCount = 0;
                let skippedCount = 0;
                
                for (const testCase of relevantTests) {
                    if (testCase.type !== 'method') continue;
                    
                    // Simple heuristic: if output contains error/failure mentioning this test, mark as failed
                    let status: 'passed' | 'failed' | 'skipped' = 'passed';
                    
                    if (skippedCount < totalSkipped && this.isTestSkipped(output, testCase.name)) {
                        status = 'skipped';
                        skippedCount++;
                    } else if (failedCount < totalFailed && this.isTestFailed(output, testCase.name)) {
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

    private isTestSkipped(output: string, methodName: string): boolean {
        return output.includes(`${methodName}`) && 
               (output.includes('SKIPPED') || output.includes('@Ignore'));
    }

    private isTestFailed(output: string, methodName: string): boolean {
        return output.includes(`${methodName}`) && 
               (output.includes('FAILURE') || output.includes('ERROR') || output.includes('AssertionError'));
    }

    private extractDuration(line: string): number | undefined {
        const match = line.match(/(\d+\.?\d*)\s*s/);
        return match ? parseFloat(match[1]) * 1000 : undefined;
    }

    private calculateSummary(testDetails: TestDetail[]): { passed: number; failed: number; skipped: number; total: number } {
        const passed = testDetails.filter(t => t.status === 'passed').length;
        const failed = testDetails.filter(t => t.status === 'failed').length;
        const skipped = testDetails.filter(t => t.status === 'skipped').length;
        
        return {
            passed,
            failed,
            skipped,
            total: testDetails.length
        };
    }

    private generateRunId(): string {
        return crypto.randomBytes(8).toString('hex');
    }

    private async notifyStatusChanges(result: TestRunResult): Promise<void> {
        const changes = await this.testFileManager.getTestStatusChanges();
        const recentChanges = changes.filter(change => 
            change.lastRunId === result.runId && change.statusChanged
        );
        
        if (recentChanges.length > 0) {
            const changeMessages = recentChanges.map(change => {
                const emoji = change.currentStatus === 'passed' ? '✅' : 
                             change.currentStatus === 'failed' ? '❌' : '⏭️';
                const previousEmoji = change.previousStatus === 'passed' ? '✅' : 
                                     change.previousStatus === 'failed' ? '❌' : '⏭️';
                
                return `${change.testKey}: ${previousEmoji} → ${emoji}`;
            });
            
            vscode.window.showInformationMessage(
                `Test status changes detected:\n${changeMessages.join('\n')}`,
                { modal: false }
            );
        }
    }

    async getLastResult(): Promise<TestRunResult | undefined> {
        return await this.testFileManager.loadTestResults();
    }

    getTestFileManager(): TestFileManager {
        return this.testFileManager;
    }
}