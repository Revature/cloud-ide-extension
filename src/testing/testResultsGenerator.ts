// src/testing/testResultsGenerator.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TestRunResult } from './testRunner';
import { ProjectTestInfo, TestCase } from './testDetector';

export class TestResultsGenerator {
    private static readonly RESULTS_FILE_NAME = 'test-results.md';

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

        const content = this.generateMarkdownContent(projectInfo, result, testType, targetName);
        
        fs.writeFileSync(resultsPath, content, 'utf8');
        
        // Open the file in VS Code
        const document = await vscode.workspace.openTextDocument(resultsPath);
        await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
    }

    private static generateMarkdownContent(
        projectInfo: ProjectTestInfo,
        result: TestRunResult,
        testType: 'all' | 'single' | 'class',
        targetName?: string
    ): string {
        const timestamp = new Date().toLocaleString();
        const statusIcon = result.success ? '✅' : '❌';
        const statusText = result.success ? 'PASSED' : 'FAILED';
        
        let title = 'All Tests';
        if (testType === 'single' && targetName) {
            title = `Test: ${targetName}`;
        } else if (testType === 'class' && targetName) {
            title = `Test Class: ${this.getShortClassName(targetName)}`;
        }

        let content = `# ${statusIcon} Test Results: ${title}\n\n`;
        content += `**Generated:** ${timestamp}  \n`;
        content += `**Project Type:** ${projectInfo.projectType.toUpperCase()}  \n`;
        content += `**Framework:** ${projectInfo.testFramework}  \n`;
        content += `**Duration:** ${result.duration}ms  \n\n`;

        // Summary section
        content += `## 📊 Summary\n\n`;
        content += `| Status | Count |\n`;
        content += `|--------|-------|\n`;
        content += `| **Total** | ${result.totalTests} |\n`;
        content += `| ✅ **Passed** | ${result.passed} |\n`;
        content += `| ❌ **Failed** | ${result.failed} |\n`;
        content += `| ⏭️ **Skipped** | ${result.skipped} |\n\n`;

        // Test Results by Class
        content += `## 🧪 Test Results\n\n`;
        
        const groupedTests = this.groupTestsByClass(projectInfo.testCases);
        
        for (const [className, tests] of Object.entries(groupedTests)) {
            const classTests = tests.filter(t => t.type === 'method');
            const classStatus = this.getClassStatus(className, classTests, result.testResultsMap);
            const classIcon = this.getStatusIcon(classStatus);
            
            content += `### ${classIcon} ${this.getShortClassName(className)}\n\n`;
            content += `**Full Name:** \`${className}\`\n\n`;
            
            // Test methods table
            if (classTests.length > 0) {
                content += `| Status | Test Method | Location |\n`;
                content += `|--------|-------------|----------|\n`;
                
                classTests.forEach(testCase => {
                    const testStatus = this.getTestStatus(testCase, result.testResultsMap);
                    const statusIcon = this.getStatusIcon(testStatus);
                    const fileName = this.getFileName(testCase.filePath);
                    
                    content += `| ${statusIcon} | \`${testCase.name}\` | ${fileName}:${testCase.line} |\n`;
                });
                
                content += '\n';
            }
        }

        // Failed Tests Details (if any)
        if (result.failed > 0) {
            content += `## ❌ Failed Tests Details\n\n`;
            
            for (const [className, tests] of Object.entries(groupedTests)) {
                const failedTests = tests.filter(t => 
                    t.type === 'method' && 
                    this.getTestStatus(t, result.testResultsMap) === 'failed'
                );
                
                if (failedTests.length > 0) {
                    content += `### ${this.getShortClassName(className)}\n\n`;
                    
                    failedTests.forEach(testCase => {
                        content += `#### ❌ \`${testCase.name}\`\n\n`;
                        content += `**Location:** ${this.getFileName(testCase.filePath)}:${testCase.line}\n\n`;
                        
                        // Try to find specific error info from results
                        const testResult = result.results.find(r => 
                            r.testCase.name === testCase.name || 
                            r.testCase.className === testCase.className
                        );
                        
                        if (testResult && testResult.error) {
                            content += `**Error:**\n\`\`\`\n${testResult.error}\n\`\`\`\n\n`;
                        }
                    });
                }
            }
        }

        // Full Output Section
        content += `## 📝 Full Test Output\n\n`;
        content += `<details>\n`;
        content += `<summary>Click to expand full output</summary>\n\n`;
        content += `\`\`\`\n${result.output}\n\`\`\`\n\n`;
        content += `</details>\n\n`;

        // Footer
        content += `---\n`;
        content += `*Generated by Cloud IDE Extension Test Runner*\n`;

        return content;
    }

    private static groupTestsByClass(testCases: TestCase[]): { [className: string]: TestCase[] } {
        const grouped: { [className: string]: TestCase[] } = {};
        testCases.forEach(testCase => {
            if (!grouped[testCase.className]) {
                grouped[testCase.className] = [];
            }
            grouped[testCase.className].push(testCase);
        });
        return grouped;
    }

    private static getTestStatus(
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

    private static getClassStatus(
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

    private static getStatusIcon(status: string): string {
        switch(status) {
            case 'passed': return '✅';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            case 'partial': return '🔶';
            case 'unknown': return '⚫';
            default: return '⚫';
        }
    }

    private static getShortClassName(fullClassName: string): string {
        const parts = fullClassName.split('.');
        return parts[parts.length - 1];
    }

    private static getFileName(filePath: string): string {
        return filePath.split(/[/\\]/).pop() || filePath;
    }
}