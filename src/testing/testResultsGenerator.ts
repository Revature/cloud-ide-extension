// Updated src/testing/testResultsGenerator.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestRunResult } from './testFileManager';
import { ProjectTestInfo, TestCase } from './testDetector';

export interface TestResultsData {
    timestamp: string;
    projectInfo: ProjectTestInfo;
    result: TestRunResult;
    testType: 'all' | 'single' | 'class';
    targetName?: string;
}

export class TestResultsGenerator {
    private static readonly RESULTS_FILE_NAME = 'test-results.json';

    static async generateResultsFile(
        workspacePath: string,
        projectInfo: ProjectTestInfo,
        result: TestRunResult,
        testType: 'all' | 'single' | 'class',
        targetName?: string
    ): Promise<void> {
        const resultsPath = path.join(workspacePath, '.vscode', this.RESULTS_FILE_NAME);
        
        // Ensure .vscode directory exists
        const vscodeDir = path.dirname(resultsPath);
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        const testResultsData: TestResultsData = {
            timestamp: new Date().toISOString(),
            projectInfo,
            result,
            testType,
            targetName
        };

        fs.writeFileSync(resultsPath, JSON.stringify(testResultsData, null, 2), 'utf8');
    }

    static async readResultsFile(workspacePath: string): Promise<TestResultsData | null> {
        const resultsPath = path.join(workspacePath, '.vscode', this.RESULTS_FILE_NAME);
        
        if (!fs.existsSync(resultsPath)) {
            return null;
        }

        try {
            const content = fs.readFileSync(resultsPath, 'utf8');
            return JSON.parse(content) as TestResultsData;
        } catch (error) {
            console.error('Error reading test results file:', error);
            return null;
        }
    }

    static getTestStatus(
        testCase: TestCase, 
        testResultsMap: { [key: string]: 'passed' | 'failed' | 'skipped' | 'unknown' }
    ): 'passed' | 'failed' | 'skipped' | 'unknown' {
        const lookupKeys = [
            `${testCase.className}#${testCase.name}`,
            testCase.name,
            `${this.getShortClassName(testCase.className)}#${testCase.name}`
        ];
        
        for (const key of lookupKeys) {
            if (testResultsMap[key]) {
                return testResultsMap[key];
            }
        }
        
        return 'unknown';
    }

    static getClassStatus(
        className: string, 
        classTests: TestCase[], 
        testResultsMap: { [key: string]: 'passed' | 'failed' | 'skipped' | 'unknown' }
    ): 'passed' | 'failed' | 'skipped' | 'partial' | 'unknown' {
        const statuses = classTests.map(test => this.getTestStatus(test, testResultsMap));
        
        if (statuses.some(s => s === 'failed')) return 'failed';
        if (statuses.some(s => s === 'skipped')) return 'skipped';
        if (statuses.every(s => s === 'passed')) return 'passed';
        if (statuses.some(s => s === 'passed')) return 'partial';
        
        return 'unknown';
    }

    private static getShortClassName(fullClassName: string): string {
        const parts = fullClassName.split('.');
        return parts[parts.length - 1];
    }
}