// resources/test-webview.js
(function() {
  const vscode = acquireVsCodeApi();
  let currentData = {};

  // Get DOM elements
  const refreshBtn = document.getElementById('refreshBtn');
  const runAllBtn = document.getElementById('runAllBtn');
  
  const loadingSection = document.getElementById('loadingSection');
  const runningSection = document.getElementById('runningSection');
  const noWorkspaceSection = document.getElementById('noWorkspaceSection');
  const noTestsSection = document.getElementById('noTestsSection');
  const projectInfoSection = document.getElementById('projectInfoSection');
  const resultsSection = document.getElementById('resultsSection');
  const testCasesSection = document.getElementById('testCasesSection');
  const errorSection = document.getElementById('errorSection');
  
  const projectType = document.getElementById('projectType');
  const testFramework = document.getElementById('testFramework');
  const totalTests = document.getElementById('totalTests');
  const testResults = document.getElementById('testResults');
  const testCasesList = document.getElementById('testCasesList');
  const errorText = document.getElementById('errorText');
  const noTestsMessage = document.getElementById('noTestsMessage');

  // Event listeners
  refreshBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
  });

  runAllBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'runAllTests' });
  });

  // Handle messages from extension
  window.addEventListener('message', event => {
      const message = event.data;
      
      if (message.command === 'updateTestData') {
          currentData = message.data;
          updateUI();
      }
  });

  function updateUI() {
      // Hide all sections first
      hideAllSections();

      // Show loading state
      if (currentData.isLoading) {
          loadingSection.style.display = 'block';
          refreshBtn.disabled = true;
          runAllBtn.disabled = true;
          return;
      }

      // Show running state
      if (currentData.isRunning) {
          runningSection.style.display = 'block';
          refreshBtn.disabled = true;
          runAllBtn.disabled = true;
          return;
      }

      // Re-enable buttons
      refreshBtn.disabled = false;

      // Handle error state
      if (currentData.error) {
          errorSection.style.display = 'block';
          errorText.textContent = currentData.error;
          return;
      }

      // Handle no workspace
      if (!currentData.hasWorkspace) {
          noWorkspaceSection.style.display = 'block';
          runAllBtn.disabled = true;
          return;
      }

      // Handle no project info (unknown project type)
      if (!currentData.projectInfo) {
          noTestsSection.style.display = 'block';
          noTestsMessage.textContent = 'Project type not supported or no test configuration found';
          runAllBtn.disabled = true;
          return;
      }

      const projectInfo = currentData.projectInfo;

      // Handle no tests found
      if (!projectInfo.hasTests || projectInfo.testCases.length === 0) {
          noTestsSection.style.display = 'block';
          noTestsMessage.textContent = `No test cases found for ${projectInfo.projectType} project using ${projectInfo.testFramework}`;
          runAllBtn.disabled = true;
          return;
      }

      // Show project info
      projectInfoSection.style.display = 'block';
      projectType.textContent = projectInfo.projectType.toUpperCase();
      testFramework.textContent = projectInfo.testFramework;
      totalTests.textContent = projectInfo.testCases.length;
      runAllBtn.disabled = false;

      // Show test results if available
      if (currentData.lastResult) {
          showTestResults(currentData.lastResult);
      }

      // Show test cases
      showTestCases(projectInfo.testCases);
  }

  function hideAllSections() {
      const sections = [
          loadingSection, runningSection, noWorkspaceSection, 
          noTestsSection, projectInfoSection, resultsSection, 
          testCasesSection, errorSection
      ];
      sections.forEach(section => {
          if (section) section.style.display = 'none';
      });
  }

  function showTestResults(result) {
      resultsSection.style.display = 'block';
      
      const statusIcon = result.success ? '✅' : '❌';
      const statusText = result.success ? 'PASSED' : 'FAILED';
      const statusClass = result.success ? 'result-success' : 'result-failure';
      
      testResults.innerHTML = `
          <div class="test-result-summary ${statusClass}">
              <div class="result-header">
                  <span class="result-icon">${statusIcon}</span>
                  <span class="result-status">${statusText}</span>
                  <span class="result-duration">${result.duration}ms</span>
              </div>
              <div class="result-stats">
                  <span class="stat-item">Total: ${result.totalTests}</span>
                  <span class="stat-item passed">Passed: ${result.passed}</span>
                  <span class="stat-item failed">Failed: ${result.failed}</span>
                  <span class="stat-item skipped">Skipped: ${result.skipped}</span>
              </div>
          </div>
      `;
  }

  function showTestCases(testCases) {
      testCasesSection.style.display = 'block';
      
      // Group test cases by class
      const groupedTests = groupTestsByClass(testCases);
      
      let html = '';
      for (const [className, tests] of Object.entries(groupedTests)) {
          const classTests = tests.filter(t => t.type === 'method');
          const classTest = tests.find(t => t.type === 'class');
          
          html += `
              <div class="test-class">
                  <div class="test-class-header">
                      <div class="test-class-info">
                          <span class="test-class-name">${getShortClassName(className)}</span>
                          <span class="test-class-package">${className}</span>
                      </div>
                      <div class="test-class-actions">
                          <button class="test-run-btn" onclick="runTestClass('${className}')">
                              ▶️ Run Class
                          </button>
                      </div>
                  </div>
                  <div class="test-methods">
          `;
          
          classTests.forEach(testCase => {
              html += `
                  <div class="test-method">
                      <div class="test-method-info">
                          <span class="test-method-name">${testCase.name}</span>
                          <span class="test-method-location">${getFileName(testCase.filePath)}:${testCase.line}</span>
                      </div>
                      <button class="test-run-btn" onclick="runSingleTest('${encodeTestCase(testCase)}')">
                          ▶️ Run
                      </button>
                  </div>
              `;
          });
          
          html += `
                  </div>
              </div>
          `;
      }
      
      testCasesList.innerHTML = html;
  }

  function groupTestsByClass(testCases) {
      const grouped = {};
      testCases.forEach(testCase => {
          if (!grouped[testCase.className]) {
              grouped[testCase.className] = [];
          }
          grouped[testCase.className].push(testCase);
      });
      return grouped;
  }

  function getShortClassName(fullClassName) {
      const parts = fullClassName.split('.');
      return parts[parts.length - 1];
  }

  function getFileName(filePath) {
      return filePath.split(/[/\\]/).pop();
  }

  function encodeTestCase(testCase) {
      return btoa(JSON.stringify(testCase));
  }

  function decodeTestCase(encoded) {
      return JSON.parse(atob(encoded));
  }

  // Global functions for button clicks
  window.runSingleTest = function(encodedTestCase) {
      const testCase = decodeTestCase(encodedTestCase);
      vscode.postMessage({
          command: 'runTest',
          testCase: testCase
      });
  };

  window.runTestClass = function(className) {
      vscode.postMessage({
          command: 'runTestClass',
          className: className
      });
  };

  // Initial load
  vscode.postMessage({ command: 'detectTests' });
})();