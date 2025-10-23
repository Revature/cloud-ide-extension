import * as vscode from 'vscode';
import * as fs from 'fs';

export async function handleStartupFile() {
    try {
        const defaultReadmePath = "/home/ubuntu/readme.md";
        const startupFilePath = process.env.STARTUP_FILE_PATH;
        
        if (startupFilePath == null || startupFilePath === '') {
            let fileExists: boolean = fs.existsSync(defaultReadmePath);
            if (fileExists) {
                console.log("Opening default readme file");
                const document = await vscode.workspace.openTextDocument(defaultReadmePath);
                const editor = await vscode.window.showTextDocument(document);
                await vscode.commands.executeCommand('markdown.showPreview');
            }
        } else {
            let fileExists: boolean = fs.existsSync(startupFilePath);
            if (fileExists) {
                console.log("Opening provided startup file");
                const filePath = vscode.Uri.file(startupFilePath);
                const document = await vscode.workspace.openTextDocument(filePath);
                
                if (startupFilePath.includes(".md")) {
                    const editor = await vscode.window.showTextDocument(document);
                    await vscode.commands.executeCommand('markdown.showPreview');
                } else {
                    await vscode.window.showTextDocument(document);
                }
            } else {
                console.error(`The startup file provided does not exist: ${startupFilePath}`);
            }
        }
    } catch (error) {
        console.error('Error opening file on startup:', error);
    }
}