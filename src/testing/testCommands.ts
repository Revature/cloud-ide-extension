// src/testing/testCommands.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { TestDetectorService } from './testDetector';
import { TestRunner } from './testRunner';

export function registerTestCommands(context: vscode.ExtensionContext) {
  const testDetectorService = new TestDetectorService();
  const testRunner = new TestRunner();

  // Register test detection command with error handling
  context.subscriptions.push(
      vscode.commands.registerCommand('cloud-ide-extension.detectTests', async () => {
          try {
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
          } catch (error) {
              console.error('Error detecting tests:', error);
              vscode.window.showErrorMessage(`Failed to detect tests: ${error instanceof Error ? error.message : String(error)}`);
          }
      })
  );

  // Register run all tests command with better feedback
  context.subscriptions.push(
      vscode.commands.registerCommand('cloud-ide-extension.runAllTests', async () => {
          try {
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

              const statusBarMessage = vscode.window.setStatusBarMessage('$(sync~spin) Running all tests...');
              
              try {
                  const command = detector.getRunAllCommand();
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
              } finally {
                  statusBarMessage.dispose();
              }
          } catch (error) {
              console.error('Error running tests:', error);
              vscode.window.showErrorMessage(`Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
          }
      })
  );

  // Register run single test command with enhanced selection
  context.subscriptions.push(
      vscode.commands.registerCommand('cloud-ide-extension.runSingleTest', async () => {
          try {
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

              // Create enhanced quick pick items with better descriptions
              const quickPickItems = projectInfo.testCases.map(testCase => ({
                  label: `$(symbol-method) ${testCase.name}`,
                  description: `${testCase.className.split('.').pop()}`,
                  detail: `${testCase.type} - ${path.basename(testCase.filePath)}:${testCase.line} - ${testCase.className}`,
                  testCase: testCase
              }));

              const selected = await vscode.window.showQuickPick(quickPickItems, {
                  placeHolder: 'Select a test to run',
                  matchOnDescription: true,
                  matchOnDetail: true,
                  ignoreFocusOut: true
              });

              if (!selected) {
                  return;
              }

              const detector = testDetectorService.getDetectorForProject(projectInfo.projectType);
              if (!detector) {
                  vscode.window.showErrorMessage(`No test runner available for ${projectInfo.projectType} projects`);
                  return;
              }

              const statusBarMessage = vscode.window.setStatusBarMessage(`$(sync~spin) Running test: ${selected.testCase.name}...`);
              
              try {
                  const command = detector.getRunSingleTestCommand(selected.testCase);
                  const result = await testRunner.runTests(command, workspacePath);
                  
                  if (result.success) {
                      vscode.window.showInformationMessage(`✅ Test ${selected.testCase.name} passed!`);
                  } else {
                      vscode.window.showErrorMessage(`❌ Test ${selected.testCase.name} failed!`);
                  }
              } finally {
                  statusBarMessage.dispose();
              }
          } catch (error) {
              console.error('Error running single test:', error);
              vscode.window.showErrorMessage(`Failed to run test: ${error instanceof Error ? error.message : String(error)}`);
          }
      })
  );

  // Dispose test runner when extension deactivates
  context.subscriptions.push(testRunner);
}