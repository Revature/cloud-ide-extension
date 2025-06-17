// Enhanced resources/webview.js with file-based results display
(function() {
    const vscode = acquireVsCodeApi();
    let countdownInterval;
    let sessionEndTime;
    let expiryNotificationTime;
    let currentTestData = {};
    let testResultsData = null; // Store test results from file
    
    // Session Management Elements
    const sessionInfo = document.getElementById('sessionInfo');
    const countdown = document.getElementById('countdown');
    const endTimeDisplay = document.getElementById('endTimeDisplay');
    const sessionManagementContainer = document.getElementById('sessionManagementContainer');
    
    // Test Elements
    const refreshTestsBtn = document.getElementById('refreshTestsBtn');
    const runAllTestsBtn = document.getElementById('runAllTestsBtn');
    const testLoadingSection = document.getElementById('testLoadingSection');
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
        
        // Handle test data updates (test detection)
        if (message.command === 'updateTestData') {
            currentTestData = message.data;
            updateTestUI();
        }

        // Handle test results updates (from file)
        if (message.command === 'updateTestResults') {
            testResultsData = message.data;
            updateTestUI(); // Refresh UI with new results
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

    function updateTestUI() {
        hideAllTestSections();
    
        if (currentTestData.isLoading) {
            testLoadingSection.style.display = 'block';
            refreshTestsBtn.disabled = true;
            runAllTestsBtn.disabled = true;
            return;
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
    
        if (!projectInfo.hasTests || projectInfo.methodCount === 0) {
            testNoTestsSection.style.display = 'block';
            testNoTestsMessage.textContent = `No test methods found for ${projectInfo.projectType} project using ${projectInfo.testFramework}`;
            runAllTestsBtn.disabled = true;
            return;
        }
    
        testProjectInfoSection.style.display = 'block';
        testProjectType.textContent = projectInfo.projectType.toUpperCase();
        testFramework.textContent = projectInfo.testFramework;
        
        // Fixed: Only count test methods, not classes
        const totalTestsText = getTotalTestsText(projectInfo.methodCount || 0);
        testTotalTests.innerHTML = totalTestsText;
        
        runAllTestsBtn.disabled = false;
    
        // Show test results if available
        if (testResultsData && testResultsData.result) {
            showTestResults(testResultsData);
        }
    
        showTestCases(projectInfo.testCases);
    }
    
    // Fixed getTotalTestsText function
    function getTotalTestsText(methodCount) {
        if (!testResultsData || !testResultsData.result) {
            return methodCount.toString();
        }
        
        const result = testResultsData.result;
        const summary = [];
        
        if (result.passed > 0) summary.push(`✅ ${result.passed} passed`);
        if (result.failed > 0) summary.push(`❌ ${result.failed} failed`);
        if (result.skipped > 0) summary.push(`⏭️ ${result.skipped} skipped`);
        
        if (summary.length === 0) {
            return methodCount.toString();
        }
        
        // Calculate actual tests that were executed from our project test cases
        let actualTestedCount = 0;
        if (currentTestData.projectInfo && currentTestData.projectInfo.testCases) {
            // Only count methods that were actually tested
            currentTestData.projectInfo.testCases.forEach(testCase => {
                if (testCase.type === 'method') {
                    const status = getTestStatus(testCase);
                    if (status !== 'unknown') {
                        actualTestedCount++;
                    }
                }
            });
        }
        
        // Use the actual tested count or fall back to result totals, but compare against methodCount
        const testedCount = actualTestedCount > 0 ? actualTestedCount : (result.passed + result.failed + result.skipped);
        return `${testedCount}/${methodCount} (${summary.join(', ')})`;
    }

    function hideAllTestSections() {
        const sections = [
            testLoadingSection, testNoWorkspaceSection, 
            testNoTestsSection, testProjectInfoSection, 
            testResultsSection, testCasesSection, testErrorSection
        ];
        sections.forEach(section => {
            if (section) section.style.display = 'none';
        });
    }

    function showTestResults(data) {
        testResultsSection.style.display = 'block';
        
        const result = data.result;
        const timestamp = new Date(result.timestamp);
        
        // Update basic info
        testResultsTitle.textContent = `Test Results (${getRunTypeText(result)})`;
        testResultsTime.textContent = `Completed: ${timestamp.toLocaleString()}`;
        testResultsDuration.textContent = `Duration: ${(result.duration / 1000).toFixed(2)}s`;
        
        // Update summary with status change indicators
        updateTestSummaryWithChanges(result);
        
        // Show individual test results with change indicators
        showTestCaseResults(result.testDetails, data.statusChanges || []);
        
        // Update the total count display
        if (currentTestData.projectInfo) {
            const totalTestsText = getTotalTestsText(currentTestData.projectInfo.methodCount || 0);
            testTotalTests.innerHTML = totalTestsText;
        }
    }

    function showTestCaseResults(testDetails, statusChanges = []) {
        testCasesList.innerHTML = '';
        
        // Group test details by class
        const testsByClass = {};
        testDetails.forEach(test => {
            if (!testsByClass[test.className]) {
                testsByClass[test.className] = [];
            }
            testsByClass[test.className].push(test);
        });
        
        // Create UI for each class
        Object.entries(testsByClass).forEach(([className, tests]) => {
            const classDiv = document.createElement('div');
            classDiv.className = 'test-class-group';
            
            const classHeader = document.createElement('div');
            classHeader.className = 'test-class-header';
            classHeader.innerHTML = `
                <span class="test-class-name">${getSimpleClassName(className)}</span>
                <span class="test-class-count">${tests.length} test${tests.length !== 1 ? 's' : ''}</span>
            `;
            classDiv.appendChild(classHeader);
            
            const testsContainer = document.createElement('div');
            testsContainer.className = 'test-methods-container';
            
            tests.forEach(test => {
                const testDiv = createTestCaseElement(test, statusChanges);
                testsContainer.appendChild(testDiv);
            });
            
            classDiv.appendChild(testsContainer);
            testCasesList.appendChild(classDiv);
        });
    }

    function createTestCaseElement(test, statusChanges) {
        const testDiv = document.createElement('div');
        testDiv.className = `test-case-item test-${test.status}`;
        
        // Check if this test has status changes
        const testKey = `${test.className}.${test.name}`;
        const statusChange = statusChanges.find(change => change.testKey === testKey);
        
        let statusIcon = getStatusIcon(test.status);
        let changeIndicator = '';
        
        if (statusChange && statusChange.statusChanged) {
            const previousIcon = getStatusIcon(statusChange.previousStatus);
            changeIndicator = `
                <span class="status-change-indicator" title="Status changed from ${statusChange.previousStatus} to ${test.status}">
                    ${previousIcon} → ${statusIcon}
                </span>
            `;
            testDiv.classList.add('status-changed');
        }
        
        const durationText = test.duration ? ` (${(test.duration / 1000).toFixed(3)}s)` : '';
        
        testDiv.innerHTML = `
            <div class="test-case-header">
                <span class="test-status-icon">${statusIcon}</span>
                <span class="test-method-name">${test.name}</span>
                ${changeIndicator}
                <span class="test-duration">${durationText}</span>
            </div>
            ${test.errorMessage ? `<div class="test-error-message">${escapeHtml(test.errorMessage)}</div>` : ''}
            ${test.stackTrace ? `<div class="test-stack-trace"><pre>${escapeHtml(test.stackTrace)}</pre></div>` : ''}
        `;
        
        // Add click handler to show/hide error details
        if (test.errorMessage || test.stackTrace) {
            testDiv.addEventListener('click', () => {
                testDiv.classList.toggle('expanded');
            });
            testDiv.classList.add('expandable');
        }
        
        return testDiv;
    }
    
    function getStatusIcon(status) {
        switch (status) {
            case 'passed': return '✅';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            default: return '❓';
        }
    }
    
    function getRunTypeText(result) {
        switch (result.runType) {
            case 'all': return 'All Tests';
            case 'single': return `Single Test: ${result.targetTest}`;
            case 'class': return `Class: ${getSimpleClassName(result.targetClass)}`;
            default: return 'Tests';
        }
    }
    
    function getSimpleClassName(fullClassName) {
        return fullClassName ? fullClassName.split('.').pop() : 'Unknown';
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Enhanced test status tracking
    function updateTestStatusDisplay() {
        if (!currentTestData.projectInfo || !testResultsData) {
            return;
        }
        
        const projectInfo = currentTestData.projectInfo;
        const result = testResultsData.result;
        
        // Update each test case with status information
        const testMethods = projectInfo.testCases.filter(tc => tc.type === 'method');
        
        testMethods.forEach(testCase => {
            const testDetail = result.testDetails.find(detail => 
                detail.name === testCase.name && detail.className === testCase.className
            );
            
            if (testDetail) {
                // Update the test case display with current status
                updateTestCaseStatusInList(testCase, testDetail);
            }
        });
    }

    // Enhanced message handling for status changes
    function handleTestResultsUpdate(message) {
        testResultsData = message.data;
        
        if (testResultsData && testResultsData.statusChanges) {
            // Show status change notifications
            showStatusChangeNotifications(testResultsData.statusChanges);
        }
        
        updateTestUI();
        updateTestStatusDisplay();
    }

    function showStatusChangeNotifications(statusChanges) {
        const recentChanges = statusChanges.filter(change => change.statusChanged);
        
        if (recentChanges.length > 0) {
            // Create a temporary notification element
            const notification = document.createElement('div');
            notification.className = 'status-change-notification';
            notification.innerHTML = `
                <div class="notification-header">
                    <span class="notification-icon">🔄</span>
                    <span class="notification-title">Test Status Changes Detected</span>
                    <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="notification-body">
                    ${recentChanges.map(change => `
                        <div class="status-change-item">
                            <span class="test-name">${change.testKey.split('.').pop()}</span>
                            <span class="status-change">
                                ${getStatusIcon(change.previousStatus)} → ${getStatusIcon(change.currentStatus)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Add to the top of the test section
            const testSection = document.querySelector('.test-section');
            if (testSection) {
                testSection.insertBefore(notification, testSection.firstChild);
                
                // Auto-remove after 10 seconds
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 10000);
            }
        }
    }
    
    // Enhanced getTotalTestsText with better change tracking
    function getTotalTestsText(methodCount) {
        if (!testResultsData || !testResultsData.result) {
            return methodCount.toString();
        }
        
        const result = testResultsData.result;
        const summary = [];
        
        // Count status changes
        let changedCount = 0;
        if (testResultsData.statusChanges) {
            changedCount = testResultsData.statusChanges.filter(c => c.statusChanged).length;
        }
        
        if (result.passed > 0) summary.push(`✅ ${result.passed} passed`);
        if (result.failed > 0) summary.push(`❌ ${result.failed} failed`);
        if (result.skipped > 0) summary.push(`⏭️ ${result.skipped} skipped`);
        if (changedCount > 0) summary.push(`🔄 ${changedCount} changed`);
        
        if (summary.length === 0) {
            return methodCount.toString();
        }
        
        // Calculate tests that were actually executed
        const executedCount = result.passed + result.failed + result.skipped;
        return `${executedCount}/${methodCount} (${summary.join(', ')})`;
    }
    
    // Update the message listener to handle status changes
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'updateSessionEndTime':
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
                break;
                
            case 'updateTestData':
                currentTestData = message.data;
                updateTestUI();
                break;
                
            case 'updateTestResults':
                handleTestResultsUpdate(message);
                break;
                
            case 'testRunStarted':
                // Show test running indicator
                showTestRunningIndicator(message.runType, message.target);
                break;
                
            case 'testRunCompleted':
                // Hide test running indicator
                hideTestRunningIndicator();
                break;
        }
    });
    
    function showTestRunningIndicator(runType, target) {
        // Create or update running indicator
        let indicator = document.getElementById('test-running-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'test-running-indicator';
            indicator.className = 'test-running-indicator';
            
            const testSection = document.querySelector('.test-section');
            if (testSection) {
                testSection.insertBefore(indicator, testSection.querySelector('.test-header').nextSibling);
            }
        }
        
        let message = 'Running tests...';
        switch (runType) {
            case 'all':
                message = '⚡ Running all tests...';
                break;
            case 'single':
                message = `⚡ Running test: ${target}...`;
                break;
            case 'class':
                message = `⚡ Running test class: ${getSimpleClassName(target)}...`;
                break;
        }
        
        indicator.innerHTML = `
            <div class="running-spinner">🔄</div>
            <div class="running-message">${message}</div>
        `;
        indicator.style.display = 'flex';
    }
    
    function hideTestRunningIndicator() {
        const indicator = document.getElementById('test-running-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }
    
    // Add some utility functions for better test management
    function refreshAllTests() {
        vscode.postMessage({ command: 'refreshTests' });
    }
    
    function openTestFile(filePath, lineNumber) {
        vscode.postMessage({ 
            command: 'openFile',
            filePath: filePath,
            lineNumber: lineNumber
        });
    }
    
    function copyTestCommand(testCase) {
        // Copy the Maven command to clipboard
        const command = `mvn test -Dtest=${testCase.className}#${testCase.name}`;
        navigator.clipboard.writeText(command).then(() => {
            showTemporaryMessage('Test command copied to clipboard!');
        });
    }
    
    function showTemporaryMessage(message, duration = 3000) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'temporary-message';
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-notificationToast-border);
            color: var(--vscode-notificationToast-foreground);
            padding: 8px 16px;
            border-radius: 4px;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => messageDiv.remove(), 300);
        }, duration);
    }

    function updateTestCaseStatusInList(testCase, testDetail) {
        // Find the test case element in the UI and update its status
        const testElements = document.querySelectorAll('.test-method');
        
        testElements.forEach(element => {
            const methodName = element.querySelector('.test-method-name');
            if (methodName && methodName.textContent === testCase.name) {
                const statusSpan = element.querySelector('.test-method-status');
                if (statusSpan) {
                    statusSpan.textContent = getStatusIcon(testDetail.status);
                    
                    // Update CSS classes for styling
                    element.classList.remove('test-passed', 'test-failed', 'test-skipped');
                    element.classList.add(`test-${testDetail.status}`);
                }
            }
        });
    }

    // Enhanced message handling for status changes
    function handleTestResultsUpdate(message) {
        testResultsData = message.data;
        
        if (testResultsData && testResultsData.statusChanges) {
            // Show status change notifications
            showStatusChangeNotifications(testResultsData.statusChanges);
        }
        
        updateTestUI();
        updateTestStatusDisplay();
    }

    function showStatusChangeNotifications(statusChanges) {
        const recentChanges = statusChanges.filter(change => change.statusChanged);
        
        if (recentChanges.length > 0) {
            // Create a temporary notification element
            const notification = document.createElement('div');
            notification.className = 'status-change-notification';
            notification.innerHTML = `
                <div class="notification-header">
                    <span class="notification-icon">🔄</span>
                    <span class="notification-title">Test Status Changes Detected</span>
                    <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="notification-body">
                    ${recentChanges.map(change => `
                        <div class="status-change-item">
                            <span class="test-name">${change.testKey.split('.').pop()}</span>
                            <span class="status-change">
                                ${getStatusIcon(change.previousStatus)} → ${getStatusIcon(change.currentStatus)}
                            </span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Add to the top of the test section
            const testSection = document.querySelector('.test-section');
            if (testSection) {
                testSection.insertBefore(notification, testSection.firstChild);
                
                // Auto-remove after 10 seconds
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 10000);
            }
        }
    }

    function updateTestSummaryWithChanges(result) {
        let summaryHTML = '';
        
        if (result.passed > 0) {
            summaryHTML += `<span class="test-status passed">✅ ${result.passed} passed</span>`;
        }
        if (result.failed > 0) {
            summaryHTML += `<span class="test-status failed">❌ ${result.failed} failed</span>`;
        }
        if (result.skipped > 0) {
            summaryHTML += `<span class="test-status skipped">⏭️ ${result.skipped} skipped</span>`;
        }
        
        testResultsSummary.innerHTML = summaryHTML;
    }

    function getTestTypeText(testType, targetName) {
        switch(testType) {
            case 'all': return 'All Tests';
            case 'single': return `Single Test: ${targetName}`;
            case 'class': return `Test Class: ${targetName ? targetName.split('.').pop() : 'Unknown'}`;
            default: return 'Unknown';
        }
    }

    function showTestCases(testCases) {
        testCasesSection.style.display = 'block';
        
        const groupedTests = groupTestsByClass(testCases);
        
        let html = '';
        for (const [className, tests] of Object.entries(groupedTests)) {
            const classTests = tests.filter(t => t.type === 'method');
            
            // Get class status from test results
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
        if (!testResultsData || !testResultsData.result || !testResultsData.result.testResultsMap) {
            return 'unknown';
        }
        
        const testResultsMap = testResultsData.result.testResultsMap;
        const lookupKeys = [
            `${testCase.className}#${testCase.name}`,
            testCase.name,
            `${getShortClassName(testCase.className)}#${testCase.name}`
        ];
        
        for (const key of lookupKeys) {
            if (testResultsMap[key]) {
                return testResultsMap[key];
            }
        }
        
        return 'unknown';
    }

    function getClassStatus(className, classTests) {
        if (!testResultsData || !testResultsData.result) {
            return 'unknown';
        }
        
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
            case 'unknown': return '⚫'; // Gray circle for not run yet
            default: return '⚫';
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
})();