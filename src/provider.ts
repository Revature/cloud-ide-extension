import * as vscode from 'vscode';
import { ViewItem, ItemType } from './viewItem';

// Cloud IDE Tree Data Provider
export class CloudIdeProvider implements vscode.TreeDataProvider<ViewItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ViewItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
    constructor(private items: ViewItem[]) {}
  
    getTreeItem(element: ViewItem): vscode.TreeItem {
      const treeItem = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None // No collapsible items
      );
      
      // Apply styling based on item type
      switch (element.type) {
        case ItemType.SessionManagementHeader:
          treeItem.contextValue = 'sessionManagementHeader';
          treeItem.description = '───────────'; // Visual separator
          treeItem.iconPath = new vscode.ThemeIcon('remote-explorer-view-icon');
          break;
          
        case ItemType.SessionInfo:
            treeItem.contextValue = 'sessionInfo';
            treeItem.description = 'placeholder';
            treeItem.tooltip = 'You will receive a notification to extend your session time 5 minutes before it ends.';
            break;
          
        case ItemType.DevServerHeader:
            treeItem.contextValue = 'serverHeader';
            treeItem.description = '───────────'; // Visual separator
            treeItem.iconPath = new vscode.ThemeIcon('server');
            break;
          
        case ItemType.DevServerMenu:
            treeItem.contextValue = 'devServerMenu';
            treeItem.tooltip = "Dev Servers can be used to view front-end sites for Angular, React, and Vue servers if they are running."
            break;
        
        case ItemType.InfoHeader:
            treeItem.iconPath = new vscode.ThemeIcon("extensions-info-message")
            treeItem.contextValue = 'infoHeader';
      }
      
      return treeItem;
    }
  
    getChildren(): ViewItem[] {
      return this.items;
    }
  
    refresh(): void {
      this._onDidChangeTreeData.fire(undefined);
    }
  }