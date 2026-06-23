import { MrTreeProvider, MrItem, ViewedFolderItem } from '../treeProvider';
import { makeMr } from './helpers';

function firstLabel(provider: MrTreeProvider): string {
  const children = provider.getChildren();
  const label = children[0].label;
  return typeof label === 'string' ? label : (label as any).label ?? String(label);
}

describe('MrTreeProvider', () => {
  it('shows loading message while loading', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setLoading();
    expect(firstLabel(p)).toBe('Loading…');
  });

  it('shows error message on error', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setError('connection refused');
    expect(firstLabel(p)).toContain('connection refused');
  });

  it('shows custom empty message when no items', () => {
    const p = new MrTreeProvider('reviewing', 'No MRs here.');
    p.setItems([]);
    expect(firstLabel(p)).toBe('No MRs here.');
  });

  it('returns MrItems after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    const items = [new MrItem(makeMr({ iid: 7 }), false)];
    p.setItems(items);
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBe(items[0]);
  });

  it('clears error state after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setError('oops');
    p.setItems([]);
    expect(firstLabel(p)).toBe('Nothing here.');
  });

  it('clears loading state after setItems', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setLoading();
    p.setItems([]);
    expect(firstLabel(p)).toBe('Nothing here.');
  });

  it('getTreeItem returns the item unchanged', () => {
    const p = new MrTreeProvider('reviewing', '');
    const item = new MrItem(makeMr(), false);
    expect(p.getTreeItem(item)).toBe(item);
  });

  it('exposes the correct bucket id', () => {
    const p = new MrTreeProvider('authored', '');
    expect(p.bucket).toBe('authored');
  });
});

describe('MrTreeProvider stable ids for diffing', () => {
  it('ViewedFolderItem has a stable id', () => {
    const p = new MrTreeProvider('reviewing', '');
    p.setItems([], [new MrItem(makeMr(), false, [], false, true)]);
    const folder = p.getChildren().find((c) => c instanceof ViewedFolderItem)!;
    expect(folder.id).toBe('viewed-folder');
  });
});

describe('MrTreeProvider background refresh keeps stale content', () => {
  it('keeps showing existing items when setLoading is called again (refresh in flight)', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    const items = [new MrItem(makeMr({ iid: 1 }), false)];
    p.setItems(items);
    p.setLoading();
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBe(items[0]);
  });

  it('keeps showing existing items when a background refresh errors', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    const items = [new MrItem(makeMr({ iid: 1 }), false)];
    p.setItems(items);
    p.setError('network blip');
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBe(items[0]);
  });

  it('still shows the Loading placeholder on the very first load (no content yet)', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setLoading();
    expect(firstLabel(p)).toBe('Loading…');
  });

  it('replaces stale items once setItems delivers fresh data', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    const stale = [new MrItem(makeMr({ iid: 1 }), false)];
    p.setItems(stale);
    p.setLoading();
    const fresh = [new MrItem(makeMr({ iid: 2 }), false)];
    p.setItems(fresh);
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0]).toBe(fresh[0]);
  });
});

describe('MrTreeProvider viewed sub-section', () => {
  it('appends a ViewedFolderItem when viewed items are present', () => {
    const p = new MrTreeProvider('reviewing', '');
    const viewed = [new MrItem(makeMr({ iid: 10 }), false, [], false, true)];
    p.setItems([], viewed);
    const children = p.getChildren();
    const folder = children.find((c) => c instanceof ViewedFolderItem);
    expect(folder).toBeDefined();
  });

  it('ViewedFolderItem label reflects the count', () => {
    const p = new MrTreeProvider('reviewing', '');
    const viewed = [
      new MrItem(makeMr({ iid: 1 }), false, [], false, true),
      new MrItem(makeMr({ iid: 2 }), false, [], false, true)
    ];
    p.setItems([], viewed);
    const folder = p.getChildren().find((c) => c instanceof ViewedFolderItem)!;
    const label = typeof folder.label === 'string' ? folder.label : (folder.label as any).label;
    expect(label).toContain('2');
  });

  it('getChildren(ViewedFolderItem) returns the viewed items', () => {
    const p = new MrTreeProvider('reviewing', '');
    const viewedItem = new MrItem(makeMr({ iid: 99 }), false, [], false, true);
    p.setItems([], [viewedItem]);
    const folder = p.getChildren().find((c) => c instanceof ViewedFolderItem) as ViewedFolderItem;
    const viewedChildren = p.getChildren(folder);
    expect(viewedChildren).toHaveLength(1);
    expect(viewedChildren[0]).toBe(viewedItem);
  });

  it('does not show ViewedFolderItem when no viewed items', () => {
    const p = new MrTreeProvider('reviewing', '');
    p.setItems([new MrItem(makeMr(), false)]);
    const children = p.getChildren();
    expect(children.some((c) => c instanceof ViewedFolderItem)).toBe(false);
  });

  it('shows empty message only when both main and viewed lists are empty', () => {
    const p = new MrTreeProvider('reviewing', 'Nothing here.');
    p.setItems([], []);
    expect(firstLabel(p)).toBe('Nothing here.');
  });

  it('main items and viewed folder coexist in root children', () => {
    const p = new MrTreeProvider('reviewing', '');
    const main = [new MrItem(makeMr({ iid: 1 }), false)];
    const viewed = [new MrItem(makeMr({ iid: 2 }), false, [], false, true)];
    p.setItems(main, viewed);
    const children = p.getChildren();
    expect(children).toHaveLength(2); // 1 main + 1 folder
    expect(children[0]).toBe(main[0]);
    expect(children[1]).toBeInstanceOf(ViewedFolderItem);
  });
});
