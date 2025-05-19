import * as vscode from 'vscode';
import * as fs from 'fs';
import { runnerConfig } from './data';

export async function handleStartupFile() {
    try {
        const defaultReadmePath = "/home/ubuntu/readme.md";
        
        if(runnerConfig.filePath == null){
            let fileExists : boolean = fs.existsSync(defaultReadmePath);
            if(fileExists){
                console.log("Opening default readme file")
                const document = await vscode.workspace.openTextDocument(defaultReadmePath);
                const editor = await vscode.window.showTextDocument(document);
                await vscode.commands.executeCommand('markdown.showPreview');
            }
        } else {
            let fileExists : boolean = fs.existsSync(runnerConfig.filePath);
            if(fileExists){
                console.log("Opening provided startup file")
                const filePath  = vscode.Uri.file(runnerConfig.filePath as string);
                const document = await vscode.workspace.openTextDocument(filePath);
                
                if(runnerConfig.filePath.includes(".md")){
                    const document = await vscode.workspace.openTextDocument(filePath);
                    const editor = await vscode.window.showTextDocument(document);
                    await vscode.commands.executeCommand('markdown.showPreview');
                } else {
                    await vscode.window.showTextDocument(document);    
                }
            } else {
                console.error(`The startup file provided does not exist: ${runnerConfig.filePath}`)
            }
        }
    } catch (error) {
        console.error('Error opening file on startup:', error);
    }
}