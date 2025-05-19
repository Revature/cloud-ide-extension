import * as vscode from 'vscode';

export function registerInfoCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('cloud-ide-extension.showInfo', async () => {
            // Show a modal information message
            vscode.window.showInformationMessage(
                'Contact help@revature.com for any issues related to the CDE. \n' +
                'Ted Balashov & Ashoka Shringla 2025.',
                { modal: true }
            );
        })
    );
}