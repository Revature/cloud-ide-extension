// src/testing/testRunner.ts
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { TestCase } from './testDetector';

export interface TestResult {
    testCase: TestCase;
    status: 'passed' | 'failed' | 'skipped' | 'error';
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
                const childProcess = child_process.spawn(shell, [...shellArgs, command], {
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
                        results: []
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
                results: []
            };
        }
    }

    private parseTestOutput(output: string, duration: number): TestRunResult {
        // Parse Maven test output
        const lines = output.split('\n');
        
        let totalTests = 0;
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        
        // Look for Maven test summary
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

        return {
            success: failed === 0,
            totalTests,
            passed,
            failed,
            skipped,
            duration,
            output,
            results: [] // Individual test results could be parsed here if needed
        };
    }

    dispose() {
        this.outputChannel.dispose();
    }
}