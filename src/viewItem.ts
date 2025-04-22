export interface ViewItem {
  label: string;
  type: ItemType;
  running?: boolean;
}

export enum ItemType {
    SessionManagementHeader,
    SessionInfo,
    ShutdownButton,
    DevServerHeader,
    DevServerMenu,
    InfoHeader
}