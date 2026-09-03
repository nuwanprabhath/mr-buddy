export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export class TreeItem {
  label: any;
  description?: string;
  tooltip?: any;
  iconPath?: any;
  contextValue?: string;
  command?: any;
  id?: string;
  collapsibleState?: TreeItemCollapsibleState;
  constructor(label: any, collapsibleState?: TreeItemCollapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class MarkdownString {
  isTrusted?: boolean;
  supportThemeIcons?: boolean;
  constructor(public value: string = '') {}
}

export class EventEmitter<T> {
  event = (_listener: (e: T) => void) => ({ dispose: () => {} });
  fire(_event: T) {}
}
