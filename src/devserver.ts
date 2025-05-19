import * as vscode from 'vscode';
import { getDevServer } from './api';

export function registerDevServerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.openDevServer', async () => {
            const input = await vscode.window.showInputBox({
                placeHolder: 'Enter a number',
                prompt: 'Please enter your desired port number, such as 4200',
                validateInput: (text) => {
                    // Validate that input contains only numbers
                    return /^\d+$/.test(text) ? null : 'Port must be a number.';
                }
            });
    
            if (input !== undefined) {
                const port = parseInt(input);
                
                try {
                    const response = await getDevServer(port);
                    const json = await response.json();
                    
                    await vscode.env.openExternal(vscode.Uri.parse(json.destination_url));
                    vscode.window.showInformationMessage(`Opened dev server on port ${port}`);
                } catch (error) {
                    console.error('Error opening dev server:', error);
                    vscode.window.showErrorMessage(`Failed to open dev server on port ${port}`);
                }
            }
        })
    );
}