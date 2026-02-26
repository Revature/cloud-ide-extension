import * as vscode from 'vscode';
import { terminateRunner } from './api';
import { idleWarningMinutes, idleTerminationMinutes, idleCheckIntervalSeconds } from './data';
import { error as logError, log } from './logger';

// Idle tracking state
let lastActivityTime = Date.now();
let idleCheckInterval: NodeJS.Timeout | undefined;
let isIdleModalActive = false;
let isTerminating = false;

// Thresholds in milliseconds (converted from config values in minutes)
const IDLE_WARNING_MS = idleWarningMinutes * 60 * 1000;
const IDLE_TERMINATE_MS = idleTerminationMinutes * 60 * 1000;

/**
 * Reset the idle timer - called when user activity is detected
 */
function resetIdleTimer() {
    lastActivityTime = Date.now();
}

/**
 * Start idle detection by listening to user activity events
 */
export function startIdleDetection(context: vscode.ExtensionContext) {
    // Register activity listeners with logging
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            log(`[IDLE] onDidChangeActiveTextEditor: ${editor?.document?.fileName ?? 'none'}`);
            resetIdleTimer();
        }),
        vscode.window.onDidChangeTextEditorSelection((event) => {
            log(`[IDLE] onDidChangeTextEditorSelection: ${event.textEditor.document.fileName}`);
            resetIdleTimer();
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
            log(`[IDLE] onDidChangeTextDocument: ${event.document.fileName}, changes: ${event.contentChanges.length}, reason: ${event.reason ?? 'user'}`);
            resetIdleTimer();
        }),
        vscode.window.onDidChangeWindowState((state) => {
            log(`[IDLE] onDidChangeWindowState: focused=${state.focused}`);
            resetIdleTimer();
        }),
        vscode.window.onDidChangeVisibleTextEditors((editors) => {
            log(`[IDLE] onDidChangeVisibleTextEditors: ${editors.length} editors`);
            resetIdleTimer();
        })
    );

    // Start the idle check interval (every 30 seconds)
    idleCheckInterval = setInterval(checkIdleStatus, idleCheckIntervalSeconds * 1000);

    // Initial activity timestamp
    resetIdleTimer();
}

/**
 * Stop idle detection and clean up
 */
export function stopIdleDetection() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = undefined;
    }
}

/**
 * Check current idle status and take action if needed
 */
function checkIdleStatus() {
    const idleTime = Date.now() - lastActivityTime;
    const idleSeconds = Math.floor(idleTime / 1000);
    const idleMinutes = Math.floor(idleSeconds / 60);
    const remainingSeconds = idleSeconds % 60;
    log(`Idle time: ${idleMinutes}m ${remainingSeconds}s (warning at ${idleWarningMinutes}m, terminate at ${idleTerminationMinutes}m)`);

    // Show warning modal if idle threshold reached (non-blocking)
    if (idleTime >= IDLE_WARNING_MS && !isIdleModalActive && !isTerminating) {
        showIdleWarning();
    }

    // Terminate if idle too long (runs regardless of modal state)
    if (idleTime >= IDLE_TERMINATE_MS && !isTerminating) {
        handleTermination();
    }
}

/**
 * Show the idle warning modal (non-blocking)
 */
function showIdleWarning() {
    isIdleModalActive = true;

    vscode.window.showWarningMessage(
        'You appear to be idle. Click to stay connected.',
        { modal: true },
        'Stay Connected'
    ).then(selection => {
        isIdleModalActive = false;
        if (selection === 'Stay Connected') {
            resetIdleTimer();
        }
    });
}

/**
 * Handle the termination sequence: save work, then terminate
 */
async function handleTermination() {
    isTerminating = true;

    try {
        // Save and commit work before terminating
        await saveWorkToGit();

        // Call the terminate API
        await terminateRunner();

        vscode.window.showInformationMessage('Session terminated due to inactivity.');
    } catch (error) {
        logError('Error during termination:', error);
        // Still mark as terminating to prevent repeated attempts
    }

    // Stop the idle check since we're terminating
    stopIdleDetection();
}

/**
 * Save all files and commit to git before termination
 */
async function saveWorkToGit() {
    try {
        // Save all open files
        await vscode.workspace.saveAll();

        // Execute git commands
        const terminal = vscode.window.createTerminal('Git Auto-Save');
        terminal.sendText('git add . && git commit -m "Auto-save before idle termination" && git push');

        // Give git commands time to complete
        await new Promise(resolve => setTimeout(resolve, 5000));

        terminal.dispose();
    } catch (error) {
        logError('Error saving work to git:', error);
        // Don't throw - we still want to proceed with termination
    }
}