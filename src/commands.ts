import * as vscode from 'vscode';
import { ViewItem, ItemType } from './viewItem';
import { CloudIdeProvider } from './provider';
import { getConfig } from './data';

export function registerCommands(context: vscode.ExtensionContext, provider: CloudIdeProvider) {
    
  context.subscriptions.push(

    vscode.commands.registerCommand('cloud-ide-extension.addTime', async () => {
      
      provider.refresh();
    }),

    vscode.commands.registerCommand('cloud-ide-extension.showInfo', async () => {
        // Show a modal information message (this will be centered and require user interaction)
        vscode.window.showInformationMessage(
                'Contact help@revature.com for any issues related to the CDE. \n'+
                'Ted Balashov & Ashoka Shringla 2025.',
                { modal: true }
            )
      }),
      vscode.commands.registerCommand('cloud-ide-extension.openDevServer', async () => {
        let monolith : string = getConfig().monolithUrl
        vscode.window.showInformationMessage(monolith)
        
        // Define the URL you want to open
        const url = vscode.Uri.parse('https://revature.com');
        
        // Open the URL in the default external browser
        const success = await vscode.env.openExternal(url);
        
        if (!success) {
            vscode.window.showErrorMessage('Failed to open the URL in browser');
        }
      })
);

}

export function deactivate() {}