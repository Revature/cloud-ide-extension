import * as vscode from 'vscode';
import { ViewItem, ItemType } from './viewItem';
import { CloudIdeProvider } from './provider';
import { registerCommands } from './commands';
import { getConfig } from './data';

export function activate(context: vscode.ExtensionContext) {

	// Create data for the view
	const viewData: ViewItem[] = [
		{ label: 'Session Management', type: ItemType.SessionManagementHeader },
		{ label: 'This session will end in:', type: ItemType.SessionInfo },
		{ label: 'Dev Servers', type: ItemType.DevServerHeader },
		{ label: 'localhost:4200', type: ItemType.DevServerMenu },
		{ label: 'Info', type: ItemType.InfoHeader },
	];

	// Create tree data provider
	const provider = new CloudIdeProvider(viewData);

	// Register the view
	vscode.window.createTreeView('cloudIdeView', { 
		treeDataProvider: provider,
		showCollapseAll: false
	});

  	registerCommands(context, provider)

	getConfig();
}

export function deactivate() {}