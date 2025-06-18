// src/testing/testFileManager.ts - Modified to store in /tmp with random filenames
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TestRunResult {
    runId: string;
    timestamp: Date;
    runType: 'all' | 'single' | 'class';
    targetTest?: string;
    targetClass?: string;
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
    testDetails: TestDetail[];
    command: string;
    output: string;
    // Add result mapping for quick status lookup
    testResultsMap: { [key: string]: 'passed' | 'failed' | 'skipped' };
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
    testKey: string;
    currentStatus: 'passed' | 'failed' | 'skipped' | 'unknown';
    previousStatus?: 'passed' | 'failed' | 'skipped' | 'unknown';
    statusChanged: boolean;
    lastRunId?: string;
    changeTimestamp?: Date;
}

export class TestFileManager {
    private workspacePath: string;
    private storageDir: string;
    private testResultsFile: string;
    private historyFile: string;
    private lockFile: string;
    private projectHash: string;
    
    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.projectHash = this.generateProjectHash(workspacePath);
        
        // Store in root/tmp directory with random file names
        this.storageDir = path.resolve('/tmp');
        const randomSuffix = crypto.randomBytes(4).toString('hex');
        this.testResultsFile = path.join(this.storageDir, `test_results_${this.projectHash}_${randomSuffix}.json`);
        this.historyFile = path.join(this.storageDir, `test_history_${this.projectHash}_${randomSuffix}.json`);
        this.lockFile = path.join(this.storageDir, `test_lock_${this.projectHash}_${randomSuffix}`);
        
        this.ensureStorageDirectory();
    }

    private generateProjectHash(workspacePath: string): string {
        return crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 12);
    }

    private ensureStorageDirectory(): void {
        try {
            // /tmp should already exist on Linux/Unix systems, but check anyway
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
            }
        } catch (error) {
            console.error('Error accessing /tmp directory:', error);
            // Fallback to workspace tmp if /tmp access fails
            this.storageDir = path.join(this.workspacePath, '.vscode', 'test-storage');
            const randomSuffix = crypto.randomBytes(4).toString('hex');
            this.testResultsFile = path.join(this.storageDir, `test_results_${this.projectHash}_${randomSuffix}.json`);
            this.historyFile = path.join(this.storageDir, `test_history_${this.projectHash}_${randomSuffix}.json`);
            this.lockFile = path.join(this.storageDir, `test_lock_${this.projectHash}_${randomSuffix}`);
            
            if (!fs.existsSync(this.storageDir)) {
                fs.mkdirSync(this.storageDir, { recursive: true });
            }
        }
    }

    async saveTestResults(result: TestRunResult): Promise<void> {
        try {
            await this.acquireLock();
            
            // Create test results map for quick lookups
            result.testResultsMap = {};
            result.testDetails.forEach(test => {
                const key = `${test.className}#${test.name}`;
                result.testResultsMap[key] = test.status;
                // Also add short key for easier lookup
                result.testResultsMap[test.name] = test.status;
            });
            
            // Load existing history
            const history = await this.loadTestHistory();
            
            // Update test status tracking
            this.updateTestStatusTracking(history, result);
            
            // For single test runs, preserve other test statuses
            if (result.runType === 'single' && history.currentRun) {
                this.preserveOtherTestStatuses(result, history.currentRun);
            }
            
            // Add current run to history
            if (history.currentRun) {
                history.previousRuns.unshift(history.currentRun);
                history.previousRuns = history.previousRuns.slice(0, 10);
            }
            history.currentRun = result;
            
            await this.saveTestHistory(history);
            
            const resultData = {
                ...result,
                _metadata: {
                    savedAt: new Date().toISOString(),
                    workspacePath: this.workspacePath,
                    projectHash: this.projectHash,
                    version: '2.1'
                }
            };
            
            fs.writeFileSync(this.testResultsFile, JSON.stringify(resultData, null, 2));
            
        } finally {
            await this.releaseLock();
        }
    }

    private preserveOtherTestStatuses(newResult: TestRunResult, previousResult: TestRunResult): void {
        // Merge previous test results that weren't run this time
        if (previousResult.testResultsMap) {
            Object.entries(previousResult.testResultsMap).forEach(([key, status]) => {
                if (!newResult.testResultsMap[key]) {
                    newResult.testResultsMap[key] = status;
                }
            });
        }
        
        // Also preserve test details for non-run tests
        if (previousResult.testDetails) {
            const runTestKeys = new Set(newResult.testDetails.map(t => `${t.className}#${t.name}`));
            const preservedDetails = previousResult.testDetails.filter(t => 
                !runTestKeys.has(`${t.className}#${t.name}`)
            );
            newResult.testDetails.push(...preservedDetails);
        }
    }

    private updateTestStatusTracking(history: TestRunHistory, newResult: TestRunResult): void {
        // Only update status for tests that were actually run
        const newlyRunTests = new Set();
        
        newResult.testDetails.forEach(testDetail => {
            const testKey = `${testDetail.className}.${testDetail.name}`;
            newlyRunTests.add(testKey);
            
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
        
        // For single test runs, don't mark other tests as changed
        if (newResult.runType === 'single') {
            history.testStatusMap.forEach((statusHistory, key) => {
                if (!newlyRunTests.has(key)) {
                    statusHistory.statusChanged = false;
                }
            });
        }
    }

    async loadTestResults(): Promise<TestRunResult | undefined> {
        try {
            if (!fs.existsSync(this.testResultsFile)) {
                return undefined;
            }
            
            const content = fs.readFileSync(this.testResultsFile, 'utf8');
            const data = JSON.parse(content);
            
            if (!this.validateTestResultsFile(data)) {
                console.warn('Test results file validation failed');
                return undefined;
            }
            
            // Ensure testResultsMap exists for backward compatibility
            if (!data.testResultsMap && data.testDetails) {
                data.testResultsMap = {};
                data.testDetails.forEach((test: TestDetail) => {
                    data.testResultsMap[`${test.className}#${test.name}`] = test.status;
                    data.testResultsMap[test.name] = test.status;
                });
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
        return data && 
               data.runId && 
               data.timestamp && 
               data.testDetails && 
               Array.isArray(data.testDetails) &&
               data._metadata &&
               data._metadata.projectHash === this.projectHash;
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
        const maxAttempts = 50;
        
        while (attempts < maxAttempts) {
            try {
                if (!fs.existsSync(this.lockFile)) {
                    fs.writeFileSync(this.lockFile, process.pid.toString());
                    return;
                }
                
                const stats = fs.statSync(this.lockFile);
                const age = Date.now() - stats.mtime.getTime();
                if (age > 30000) {
                    fs.unlinkSync(this.lockFile);
                    continue;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            } catch (error) {
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

    getStorageDirectory(): string {
        return this.storageDir;
    }
}