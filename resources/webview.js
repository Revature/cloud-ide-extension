(function() {
    const vscode = acquireVsCodeApi();
    let countdownInterval;
    let sessionEndTime;
    let expiryNotificationTime;
    let currentTestData = {};
    let testResultsMap = new Map(); // Store test results for visual indicators
    let runningTests = new Set(); // Track which tests are currently running
    
    // Session Management Elements
    const sessionInfo = document.getElementById('sessionInfo');
    const countdown = document.getElementById('countdown');
    const endTimeDisplay = document.getElementById('endTimeDisplay');
    const sessionManagementContainer = document.getElementById('sessionManagementContainer');
    
    // Test Elements
    const refreshTestsBtn = document.getElementById('refreshTestsBtn');
    const runAllTestsBtn = document.getElementById('runAllTestsBtn');
    const testLoadingSection = document.getElementById('testLoadingSection');
    const testRunningSection = document.getElementById('testRunningSection');
    const testNoWorkspaceSection = document.getElementById('testNoWorkspaceSection');
    const testNoTestsSection = document.getElementById('testNoTestsSection');
    const testProjectInfoSection = document.getElementById('testProjectInfoSection');
    const testResultsSection = document.getElementById('testResultsSection');
    const testCasesSection = document.getElementById('testCasesSection');
    const testErrorSection = document.getElementById('testErrorSection');
    
    const testProjectType = document.getElementById('testProjectType');
    const testFramework = document.getElementById('testFramework');
    const testTotalTests = document.getElementById('testTotalTests');
    const testResults = document.getElementById('testResults');
    const testCasesList = document.getElementById('testCasesList');
    const testErrorText = document.getElementById('testErrorText');
    const testNoTestsMessage = document.getElementById('testNoTestsMessage');

    // Browser Elements
    const openDevServerBtn = document.getElementById('openDevServerBtn');
    const showInfoBtn = document.getElementById('showInfoBtn');
    
    console.log('Webview script initialized');
    
    // Request the session end time as soon as the webview loads
    vscode.postMessage({
        command: 'getSessionEndTime'
    });

    // Request initial test data
    vscode.postMessage({
        command: 'detectTests'
    });
    
    // Session Management Event Listeners
    window.addEventListener('message', event => {
        const message = event.data;
        
        if (message.command === 'updateSessionEndTime') {
            sessionEndTime = new Date(message.sessionEndTime);
            
            if (message.expiryNotificationTime) {
                expiryNotificationTime = message.expiryNotificationTime * 60 * 1000;
            } else {
                expiryNotificationTime = 10 * 60 * 1000;
            }
            
            endTimeDisplay.textContent = 'Ends at: ' + sessionEndTime.toLocaleString();
            
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }
            
            updateCountdown();
            countdownInterval = setInterval(updateCountdown, 1000);
        }
        
        // Handle test data updates
        if (message.command === 'updateTestData') {
            currentTestData = message.data;
            
            // Update test results map if available
            if (currentTestData.lastResult && currentTestData.lastResult.testResultsMap) {
                testResultsMap.clear();
                // Convert the testResultsMap object to a Map
                if (typeof currentTestData.lastResult.testResultsMap === 'object') {
                    Object.entries(currentTestData.lastResult.testResultsMap).forEach(([key, value]) => {
                        testResultsMap.set(key, value);
                    });
                }
            }
            
            updateTestUI();
        }

        // Handle test start notifications
        if (message.command === 'testStarted') {
            if (message.testName) {
                runningTests.add(message.testName);
                updateTestCaseStatus(message.testName, 'running');
            } else if (message.className) {
                // Mark all tests in class as running
                markClassTestsAsRunning(message.className);
            }
        }

        // Handle test completion notifications
        if (message.command === 'testCompleted') {
            if (message.testName) {
                runningTests.delete(message.testName);
                testResultsMap.set(message.testName, message.status);
                updateTestCaseStatus(message.testName, message.status);
            }
        }
    });

    // Test Event Listeners
    refreshTestsBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'refreshTests' });
    });

    runAllTestsBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'runAllTests' });
    });

    // Browser and Info Event Listeners
    openDevServerBtn.addEventListener('click', () => {
        vscode.postMessage({
            command: 'openDevServer'
        });
    });
    
    showInfoBtn.addEventListener('click', () => {
        console.log('Show info button clicked');
        vscode.postMessage({
            command: 'showInfo'
        });
    });

    // Session Management Functions
    function updateCountdown() {
        if (!sessionEndTime) return;
        
        const now = new Date();
        const timeRemaining = sessionEndTime - now;
        
        if (timeRemaining <= 0) {
            countdown.textContent = 'Your session will end now!';
            countdown.classList.add('warning');
            clearInterval(countdownInterval);
        } else {
            const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
            
            const formattedTime = 
                (hours > 0 ? hours + ' hours, ' : '') + 
                (minutes < 10 ? '0' : '') + minutes + ':' + 
                (seconds < 10 ? '0' : '') + seconds;
            
            countdown.textContent = "Session will end in: " + formattedTime;
        }
        
        if (timeRemaining <= 0 || timeRemaining <= expiryNotificationTime) {
            let addTimeBtn = document.getElementById('addTimeBtn');
            
            if (!addTimeBtn) {
                sessionInfo.innerHTML = '';
                
                addTimeBtn = document.createElement('button');
                addTimeBtn.id = 'addTimeBtn';
                addTimeBtn.className = 'button';
                addTimeBtn.textContent = 'Time Management';
                
                addTimeBtn.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'addTime'
                    });
                });
                
                sessionManagementContainer.appendChild(addTimeBtn);
            }
            
            countdown.classList.add('warning');
        } else {
            const addTimeBtn = document.getElementById('addTimeBtn');
            if (addTimeBtn) {
                addTimeBtn.remove();
            }
            
            const minutesBeforeExpiry = Math.ceil(expiryNotificationTime / (60 * 1000));
            sessionInfo.textContent = `You will be able to extend your session ${minutesBeforeExpiry} minutes before it expires.`;
            sessionInfo.className = 'small-info';
            countdown.classList.remove('warning');
        }
    }

    // Test Management Functions
    function updateTestUI() {
        hideAllTestSections();

        if (currentTestData.isLoading) {
            testLoadingSection.style.display = 'block';
            refreshTestsBtn.disabled = true;
            runAllTestsBtn.disabled = true;
            return;
        }

        // For running state, we still show the test cases but with running indicators
        if (currentTestData.isRunning) {
            refreshTestsBtn.disabled = true;
            runAllTestsBtn.disabled = true;
            // Don't return here - continue to show test cases with running indicators
        } else {
            refreshTestsBtn.disabled = false;
        }

        refreshTestsBtn.disabled = false;

        if (currentTestData.error) {
            testErrorSection.style.display = 'block';
            testErrorText.textContent = currentTestData.error;
            return;
        }

        if (!currentTestData.hasWorkspace) {
            testNoWorkspaceSection.style.display = 'block';
            runAllTestsBtn.disabled = true;
            return;
        }

        if (!currentTestData.projectInfo) {
            testNoTestsSection.style.display = 'block';
            testNoTestsMessage.textContent = 'Project type not supported or no test configuration found';
            runAllTestsBtn.disabled = true;
            return;
        }

        const projectInfo = currentTestData.projectInfo;

        if (!projectInfo.hasTests || projectInfo.testCases.length === 0) {
            testNoTestsSection.style.display = 'block';
            testNoTestsMessage.textContent = `No test cases found for ${projectInfo.projectType} project using ${projectInfo.testFramework}`;
            runAllTestsBtn.disabled = true;
            return;
        }

        testProjectInfoSection.style.display = 'block';
        testProjectType.textContent = projectInfo.projectType.toUpperCase();
        testFramework.textContent = projectInfo.testFramework;
        
        // Enhanced total tests display with pass/fail summary
        const totalTestsText = getTotalTestsText(projectInfo.testCases.length);
        testTotalTests.innerHTML = totalTestsText;
        
        runAllTestsBtn.disabled = false;

        if (currentTestData.lastResult) {
            showTestResults(currentTestData.lastResult);
        }

        showTestCases(projectInfo.testCases);
    }

    function getTotalTestsText(totalCount) {
        if (testResultsMap.size === 0) {
            return totalCount.toString();
        }
        
        // Count test results
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        
        testResultsMap.forEach(status => {
            switch(status) {
                case 'passed': passed++; break;
                case 'failed': failed++; break;
                case 'skipped': skipped++; break;
            }
        });
        
        const testedCount = passed + failed + skipped;
        
        if (testedCount === 0) {
            return totalCount.toString();
        }
        
        const passedText = passed > 0 ? `✅ ${passed} passed` : '';
        const failedText = failed > 0 ? `❌ ${failed} failed` : '';
        const skippedText = skipped > 0 ? `⏭️ ${skipped} skipped` : '';
        
        const parts = [passedText, failedText, skippedText].filter(p => p);
        const summary = parts.join(', ');
        
        return `${testedCount}/${totalCount} (${summary})`;
    }

    function hideAllTestSections() {
        const sections = [
            testLoadingSection, testRunningSection, testNoWorkspaceSection, 
            testNoTestsSection, testProjectInfoSection, testResultsSection, 
            testCasesSection, testErrorSection
        ];
        sections.forEach(section => {
            if (section) section.style.display = 'none';
        });
    }

    function showTestResults(result) {
        testResultsSection.style.display = 'block';
        
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
        
        const groupedTests = groupTestsByClass(testCases);
        
        let html = '';
        for (const [className, tests] of Object.entries(groupedTests)) {
            const classTests = tests.filter(t => t.type === 'method');
            
            // Calculate class-level status
            const classStatus = getClassStatus(className, classTests);
            const classStatusIcon = getStatusIcon(classStatus);
            
            html += `
                <div class="test-class">
                    <div class="test-class-header">
                        <div class="test-class-info">
                            <span class="test-class-status">${classStatusIcon}</span>
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
                const testStatus = getTestStatus(testCase);
                const statusIcon = getStatusIcon(testStatus);
                
                html += `
                    <div class="test-method">
                        <div class="test-method-info">
                            <span class="test-method-status">${statusIcon}</span>
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

    function getTestStatus(testCase) {
        // Check if test is currently running
        const testKey = `${testCase.className}#${testCase.name}`;
        if (runningTests.has(testCase.name) || runningTests.has(testKey)) {
            return 'running';
        }
        
        // Try multiple lookup strategies for completed tests
        const lookupKeys = [
            `${testCase.className}#${testCase.name}`,
            testCase.name,
            `${getShortClassName(testCase.className)}#${testCase.name}`
        ];
        
        for (const key of lookupKeys) {
            if (testResultsMap.has(key)) {
                return testResultsMap.get(key);
            }
        }
        
        return 'unknown';
    }

    function getClassStatus(className, classTests) {
        const statuses = classTests.map(test => getTestStatus(test));
        
        if (statuses.some(s => s === 'failed')) return 'failed';
        if (statuses.some(s => s === 'skipped')) return 'skipped';
        if (statuses.every(s => s === 'passed')) return 'passed';
        if (statuses.some(s => s === 'passed')) return 'partial';
        
        return 'unknown';
    }

    function getStatusIcon(status) {
        switch(status) {
            case 'passed': return '✅';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            case 'partial': return '🔶';
            case 'running': return '<span class="spinning">🔄</span>';
            default: return '⚫'; // Unknown/not run
        }
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

    // Global functions for test button clicks
    window.runSingleTest = function(encodedTestCase) {
        const testCase = decodeTestCase(encodedTestCase);
        
        // Mark test as running
        runningTests.add(testCase.name);
        updateTestCaseStatus(testCase.name, 'running');
        
        vscode.postMessage({
            command: 'runTest',
            testCase: testCase
        });
    };

    window.runTestClass = function(className) {
        // Mark all tests in class as running
        markClassTestsAsRunning(className);
        
        vscode.postMessage({
            command: 'runTestClass',
            className: className
        });
    };

    // Helper functions for real-time status updates
    function updateTestCaseStatus(testName, status) {
        // Find and update the specific test case in the UI
        const testElements = document.querySelectorAll('.test-method');
        testElements.forEach(element => {
            const methodNameElement = element.querySelector('.test-method-name');
            if (methodNameElement && methodNameElement.textContent === testName) {
                const statusElement = element.querySelector('.test-method-status');
                if (statusElement) {
                    statusElement.innerHTML = getStatusIcon(status);
                }
            }
        });
    }

    function markClassTestsAsRunning(className) {
        if (!currentTestData.projectInfo || !currentTestData.projectInfo.testCases) {
            return;
        }
        
        // Find all tests in the class and mark them as running
        currentTestData.projectInfo.testCases.forEach(testCase => {
            if (testCase.className === className) {
                runningTests.add(testCase.name);
                updateTestCaseStatus(testCase.name, 'running');
            }
        });
    }
})();