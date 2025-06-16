// src/testing/testRunner.ts

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { TestCase } from './testDetector';

export interface TestResult {
    testCase: TestCase;
    status: 'passed' | 'failed' | 'skipped' | 'error' | 'unknown';
    duration: number;
    output: string;
    error?: string;
}

export interface TestRunResult {
    success: boolean;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    output: string;
    results: TestResult[];
    // Serialize as object for JSON transfer to webview
    testResultsMap: { [key: string]: 'passed' | 'failed' | 'skipped' | 'unknown' };
}

export class TestRunner {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Test Runner');
    }

    async runTests(command: string, workspacePath: string): Promise<TestRunResult> {
        this.outputChannel.clear();
        this.outputChannel.show();
        this.outputChannel.appendLine(`Running command: ${command}`);
        this.outputChannel.appendLine('─'.repeat(50));

        const startTime = Date.now();
        
        try {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd' : 'bash';
            const shellArgs = isWindows ? ['/c'] : ['-c'];
            
            return new Promise((resolve) => {
                const childProcess = spawn(shell, [...shellArgs, command], {
                    cwd: workspacePath,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let output = '';
                let errorOutput = '';

                childProcess.stdout?.on('data', (data: Buffer) => {
                    const text = data.toString();
                    output += text;
                    this.outputChannel.append(text);
                });

                childProcess.stderr?.on('data', (data: Buffer) => {
                    const text = data.toString();
                    errorOutput += text;
                    this.outputChannel.append(text);
                });

                childProcess.on('close', (code: number) => {
                    const duration = Date.now() - startTime;
                    const fullOutput = output + errorOutput;
                    
                    this.outputChannel.appendLine('─'.repeat(50));
                    this.outputChannel.appendLine(`Process exited with code: ${code}`);
                    this.outputChannel.appendLine(`Duration: ${duration}ms`);

                    const result = this.parseTestOutput(fullOutput, duration);
                    result.success = code === 0;
                    
                    resolve(result);
                });

                childProcess.on('error', (error: Error) => {
                    this.outputChannel.appendLine(`Error: ${error.message}`);
                    resolve({
                        success: false,
                        totalTests: 0,
                        passed: 0,
                        failed: 1,
                        skipped: 0,
                        duration: Date.now() - startTime,
                        output: error.message,
                        results: [],
                        testResultsMap: {}
                    });
                });
            });
        } catch (error) {
            const duration = Date.now() - startTime;
            this.outputChannel.appendLine(`Failed to run tests: ${error}`);
            
            return {
                success: false,
                totalTests: 0,
                passed: 0,
                failed: 1,
                skipped: 0,
                duration,
                output: error instanceof Error ? error.message : String(error),
                results: [],
                testResultsMap: {}
            };
        }
    }

    private parseTestOutput(output: string, duration: number): TestRunResult {
        const lines = output.split('\n');
        
        let totalTests = 0;
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const testResultsMap = new Map<string, 'passed' | 'failed' | 'skipped' | 'unknown'>();
        const results: TestResult[] = [];

        // Parse Maven test output for summary
        for (const line of lines) {
            if (line.includes('Tests run:')) {
                const match = line.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)/);
                if (match) {
                    totalTests = parseInt(match[1]);
                    const failures = parseInt(match[2]);
                    const errors = parseInt(match[3]);
                    skipped = parseInt(match[4]);
                    failed = failures + errors;
                    passed = totalTests - failed - skipped;
                    break;
                }
            }
        }

        // Parse individual test results from Maven output
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for test method results in Maven output format
            // Example: "test(com.example.MyTestClass)  Time elapsed: 0.001 s  <<< FAILURE!"
            // or "testMethod(com.example.MyTestClass)  Time elapsed: 0.001 s"
            const testResultMatch = line.match(/(\w+)\(([^)]+)\)\s+Time elapsed: ([\d.]+) s(?:\s+<<<\s+(\w+))?/);
            if (testResultMatch) {
                const methodName = testResultMatch[1];
                const className = testResultMatch[2];
                const testDuration = parseFloat(testResultMatch[3]) * 1000; // Convert to ms
                const status = testResultMatch[4];
                
                let testStatus: 'passed' | 'failed' | 'skipped' | 'unknown' = 'passed';
                if (status === 'FAILURE' || status === 'ERROR') {
                    testStatus = 'failed';
                } else if (status === 'SKIPPED') {
                    testStatus = 'skipped';
                }
                
                const testKey = `${className}#${methodName}`;
                testResultsMap.set(testKey, testStatus);
                testResultsMap.set(methodName, testStatus); // Also store by method name for easier lookup
                
                // Try to create a TestResult object
                results.push({
                    testCase: {
                        name: methodName,
                        className: className,
                        filePath: '', // Not available from Maven output
                        line: 0,
                        type: 'method'
                    },
                    status: testStatus,
                    duration: testDuration,
                    output: line,
                    error: status === 'FAILURE' || status === 'ERROR' ? 'Test failed' : undefined
                });
            }
        }

        // Convert Map to object for JSON serialization
        const testResultsMapObject: { [key: string]: 'passed' | 'failed' | 'skipped' | 'unknown' } = {};
        testResultsMap.forEach((value, key) => {
            testResultsMapObject[key] = value;
        });

        return {
            success: failed === 0,
            totalTests,
            passed,
            failed,
            skipped,
            duration,
            output,
            results,
            testResultsMap: testResultsMapObject
        };
    }

    dispose() {
        this.outputChannel.dispose();
    }
}