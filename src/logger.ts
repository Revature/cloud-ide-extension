import * as vscode from 'vscode';

// Reference to the webview for sending log messages
let webviewView: vscode.WebviewView | undefined;

/**
 * Initialize the logger with a webview reference
 */
export function initLogger(view: vscode.WebviewView) {
    webviewView = view;
}

/**
 * Send a log message to the browser console via webview
 */
function sendToConsole(level: 'log' | 'warn' | 'error', message: string, ...args: unknown[]) {
    if (webviewView) {
        webviewView.webview.postMessage({
            command: 'console',
            level,
            message,
            args
        });
    }

    // Also log to extension host for debugging
    switch (level) {
        case 'error':
            console.error(`[CDE] ${message}`, ...args);
            break;
        case 'warn':
            console.warn(`[CDE] ${message}`, ...args);
            break;
        default:
            console.log(`[CDE] ${message}`, ...args);
    }
}

export function log(message: string, ...args: unknown[]) {
    sendToConsole('log', message, ...args);
}

export function warn(message: string, ...args: unknown[]) {
    sendToConsole('warn', message, ...args);
}

export function error(message: string, ...args: unknown[]) {
    sendToConsole('error', message, ...args);
}