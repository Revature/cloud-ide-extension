// src/testing/testFileManager.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TestRunResult {
    runId: string;
    timestamp: Date;
    runType: 'all' | 'single' | 'class';
    targetTest?: string; // For single test runs
    targetClass?: string; // For class runs
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
    testDetails: TestDetail[];
    command: string;
    output: string;
}

export interface TestDetail {
    name: string;
    className: string;
    status: 'passed' | 'failed' | 'skipped';
    duration?: number;
    errorMessage?: string;
    stackTrace?: string;
}

export interface TestRunHistory {
    currentRun?: TestRunResult;
    previousRuns: TestRunResult[];
    testStatusMap: Map<string, TestStatusHistory>;
}

export interface TestStatusHistory {
    testKey: string; // className.methodName
    currentStatus: 'passed' | 'failed' | 'skipped' | 'unknown';
    previousStatus?: 'passed' | 'failed' | 'skipped';
    statusChanged: boolean;
    lastRunId?: string;
    changeTimestamp?: Date;
}

export class TestFileManager {
    private workspacePath: string;
    private tmpDir: string;
    private testResultsFile: string;
    private historyFile: string;
    private lockFile: string;
    
    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.tmpDir = path.join(this.workspacePath, 'tmp');
        
        // Use obscured file names to prevent easy user modification
        const projectHash = this.generateProjectHash(workspacePath);
        this.testResultsFile = path.join(this.tmpDir, `.test_results_${projectHash}.json`);
        this.historyFile = path.join(this.tmpDir, `.test_history_${projectHash}.json`);
        this.lockFile = path.join(this.tmpDir, `.test_lock_${projectHash}`);
        
        this.ensureTmpDirectory();
    }

    private generateProjectHash(workspacePath: string): string {
        // Create a hash based on workspace path for unique file naming
        return crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 8);
    }

    private ensureTmpDirectory(): void {
        try {
            if (!fs.existsSync(this.tmpDir)) {
                fs.mkdirSync(this.tmpDir, { recursive: true });
            }
            
            // Create .gitignore to prevent committing test files
            const gitignorePath = path.join(this.tmpDir, '.gitignore');
            if (!fs.existsSync(gitignorePath)) {
                fs.writeFileSync(gitignorePath, '# Auto-generated test files - do not commit\n*\n!.gitignore\n');
            }
        } catch (error) {
            console.error('Error creating tmp directory:', error);
            throw new Error('Failed to create protected test results directory');
        }
    }

    async saveTestResults(result: TestRunResult): Promise<void> {
        try {
            await this.acquireLock();
            
            // Load existing history
            const history = await this.loadTestHistory();
            
            // Update test status tracking
            this.updateTestStatusTracking(history, result);
            
            // Add current run to history
            if (history.currentRun) {
                history.previousRuns.unshift(history.currentRun);
                // Keep only last 10 runs to prevent file bloat
                history.previousRuns = history.previousRuns.slice(0, 10);
            }
            history.currentRun = result;
            
            // Save updated history
            await this.saveTestHistory(history);
            
            // Save current results (for backward compatibility)
            const resultData = {
                ...result,
                _metadata: {
                    savedAt: new Date().toISOString(),
                    workspacePath: this.workspacePath,
                    version: '2.0'
                }
            };
            
            fs.writeFileSync(this.testResultsFile, JSON.stringify(resultData, null, 2));
            
        } finally {
            await this.releaseLock();
        }
    }

    private updateTestStatusTracking(history: TestRunHistory, newResult: TestRunResult): void {
        newResult.testDetails.forEach(testDetail => {
            const testKey = `${testDetail.className}.${testDetail.name}`;
            const existing = history.testStatusMap.get(testKey);
            
            const statusHistory: TestStatusHistory = {
                testKey,
                currentStatus: testDetail.status,
                previousStatus: existing?.currentStatus,
                statusChanged: existing ? existing.currentStatus !== testDetail.status : false,
                lastRunId: newResult.runId,
                changeTimestamp: existing && existing.currentStatus !== testDetail.status ? new Date() : existing?.changeTimestamp
            };
            
            history.testStatusMap.set(testKey, statusHistory);
        });
    }

    async loadTestResults(): Promise<TestRunResult | undefined> {
        try {
            if (!fs.existsSync(this.testResultsFile)) {
                return undefined;
            }
            
            const content = fs.readFileSync(this.testResultsFile, 'utf8');
            const data = JSON.parse(content);
            
            // Validate file integrity
            if (!this.validateTestResultsFile(data)) {
                console.warn('Test results file appears to be corrupted or tampered with');
                return undefined;
            }
            
            return data;
        } catch (error) {
            console.error('Error loading test results:', error);
            return undefined;
        }
    }

    async loadTestHistory(): Promise<TestRunHistory> {
        try {
            if (!fs.existsSync(this.historyFile)) {
                return {
                    previousRuns: [],
                    testStatusMap: new Map()
                };
            }
            
            const content = fs.readFileSync(this.historyFile, 'utf8');
            const data = JSON.parse(content);
            
            // Convert plain object back to Map
            const testStatusMap = new Map();
            if (data.testStatusMap) {
                Object.entries(data.testStatusMap).forEach(([key, value]) => {
                    testStatusMap.set(key, value);
                });
            }
            
            return {
                currentRun: data.currentRun,
                previousRuns: data.previousRuns || [],
                testStatusMap
            };
        } catch (error) {
            console.error('Error loading test history:', error);
            return {
                previousRuns: [],
                testStatusMap: new Map()
            };
        }
    }

    private async saveTestHistory(history: TestRunHistory): Promise<void> {
        try {
            // Convert Map to plain object for JSON serialization
            const serializable = {
                ...history,
                testStatusMap: Object.fromEntries(history.testStatusMap)
            };
            
            fs.writeFileSync(this.historyFile, JSON.stringify(serializable, null, 2));
        } catch (error) {
            console.error('Error saving test history:', error);
            throw error;
        }
    }

    private validateTestResultsFile(data: any): boolean {
        // Basic validation to detect tampering
        return data && 
               data.runId && 
               data.timestamp && 
               data.testDetails && 
               Array.isArray(data.testDetails) &&
               data._metadata &&
               data._metadata.workspacePath === this.workspacePath;
    }

    async getTestStatusChanges(): Promise<TestStatusHistory[]> {
        const history = await this.loadTestHistory();
        return Array.from(history.testStatusMap.values())
            .filter(status => status.statusChanged);
    }

    async getTestStatus(className: string, methodName: string): Promise<TestStatusHistory | undefined> {
        const history = await this.loadTestHistory();
        const testKey = `${className}.${methodName}`;
        return history.testStatusMap.get(testKey);
    }

    private async acquireLock(): Promise<void> {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        
        while (attempts < maxAttempts) {
            try {
                if (!fs.existsSync(this.lockFile)) {
                    fs.writeFileSync(this.lockFile, process.pid.toString());
                    return;
                }
                
                // Check if lock is stale (older than 30 seconds)
                const stats = fs.statSync(this.lockFile);
                const age = Date.now() - stats.mtime.getTime();
                if (age > 30000) {
                    fs.unlinkSync(this.lockFile);
                    continue;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            } catch (error) {
                // Lock file might have been deleted, try again
                attempts++;
            }
        }
        
        throw new Error('Could not acquire lock for test results file');
    }

    private async releaseLock(): Promise<void> {
        try {
            if (fs.existsSync(this.lockFile)) {
                fs.unlinkSync(this.lockFile);
            }
        } catch (error) {
            console.error('Error releasing lock:', error);
        }
    }

    async cleanupOldResults(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
        // Clean up results older than maxAge (default 7 days)
        try {
            const history = await this.loadTestHistory();
            const cutoff = new Date(Date.now() - maxAge);
            
            history.previousRuns = history.previousRuns.filter(run => 
                new Date(run.timestamp) > cutoff
            );
            
            await this.saveTestHistory(history);
        } catch (error) {
            console.error('Error cleaning up old test results:', error);
        }
    }

    getTestResultsPath(): string {
        return this.testResultsFile;
    }

    getTmpDirectory(): string {
        return this.tmpDir;
    }
}