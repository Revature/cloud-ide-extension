// src/testing/testCommands.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { TestDetectorService } from './testDetector';
import { TestRunner } from './testRunner';
export function registerTestCommands(context: vscode.ExtensionContext) {
    const testDetectorService = new TestDetectorService();
    const testRunner = new TestRunner();

    // Register test detection command
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.detectTests', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const projectInfo = await testDetectorService.detectProjectTests(workspacePath);

            if (projectInfo.hasTests) {
                vscode.window.showInformationMessage(
                    `Found ${projectInfo.testCases.length} test cases using ${projectInfo.testFramework}`
                );
            } else {
                vscode.window.showInformationMessage('No test cases found in the current workspace');
            }
        })
    );

    // Register run all tests command
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.runAllTests', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const projectInfo = await testDetectorService.detectProjectTests(workspacePath);

            if (!projectInfo.hasTests) {
                vscode.window.showWarningMessage('No tests found in the current workspace');
                return;
            }

            const detector = testDetectorService.getDetectorForProject(projectInfo.projectType);
            if (!detector) {
                vscode.window.showErrorMessage(`No test runner available for ${projectInfo.projectType} projects`);
                return;
            }

            const command = detector.getRunAllCommand();
            vscode.window.showInformationMessage(`Running all tests...`);
            
            const result = await testRunner.runTests(command, workspacePath);
            
            if (result.success) {
                vscode.window.showInformationMessage(
                    `✅ All tests passed! (${result.passed}/${result.totalTests}) in ${result.duration}ms`
                );
            } else {
                vscode.window.showErrorMessage(
                    `❌ Tests failed! (${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped)`
                );
            }
        })
    );

    // Register run single test command
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.runSingleTest', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder found');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const projectInfo = await testDetectorService.detectProjectTests(workspacePath);

            if (!projectInfo.hasTests) {
                vscode.window.showWarningMessage('No tests found in the current workspace');
                return;
            }

            // Create quick pick items
            const quickPickItems = projectInfo.testCases.map(testCase => ({
                label: testCase.name,
                description: testCase.className,
                detail: `${testCase.type} - ${path.basename(testCase.filePath)}:${testCase.line}`,
                testCase: testCase
            }));

            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a test to run',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selected) {
                return;
            }

            const detector = testDetectorService.getDetectorForProject(projectInfo.projectType);
            if (!detector) {
                vscode.window.showErrorMessage(`No test runner available for ${projectInfo.projectType} projects`);
                return;
            }

            const command = detector.getRunSingleTestCommand(selected.testCase);
            vscode.window.showInformationMessage(`Running test: ${selected.label}`);
            
            const result = await testRunner.runTests(command, workspacePath);
            
            if (result.success) {
                vscode.window.showInformationMessage(`✅ Test ${selected.label} passed!`);
            } else {
                vscode.window.showErrorMessage(`❌ Test ${selected.label} failed!`);
            }
        })
    );

    // Dispose test runner when extension deactivates
    context.subscriptions.push(testRunner);
}