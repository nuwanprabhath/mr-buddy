import { MrItem, MrTreeProvider, AuthorGroupItem, ViewedFolderItem, groupByAuthor } from '../treeProvider';
import { TreeItemCollapsibleState } from '../__mocks__/vscode';
import { makeMr, makeUser } from './helpers';

function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

describe('groupByAuthor', () => {
  it('groups items by author username', () => {
    const items = [
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }) }), false),
      new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'alice' }) }), false)
    ];
    const groups = groupByAuthor(items);
    expect(groups).toHaveLength(2);
    const alice = groups.find((g) => g.username === 'alice')!;
    expect(alice.items.map((i) => i.mr.iid)).toEqual([1, 3]);
  });

  it('orders groups by the most recently updated MR in each group, not alphabetically', () => {
    // bob's only MR is the most recently updated, so bob's group should sort first
    // even though "alice" < "bob" alphabetically.
    const items = [
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }), updated_at: iso(48) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }), updated_at: iso(1) }), false),
      new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'alice' }), updated_at: iso(72) }), false)
    ];
    const groups = groupByAuthor(items);
    expect(groups.map((g) => g.username)).toEqual(['bob', 'alice']);
  });

  it('uses the single most recent MR in a group, not the first item, to rank it', () => {
    // alice's second (later) item is more recent than bob's only item, even
    // though it is not the first item in alice's array.
    const items = [
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }), updated_at: iso(48) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'alice' }), updated_at: iso(1) }), false),
      new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'bob' }), updated_at: iso(10) }), false)
    ];
    const groups = groupByAuthor(items);
    expect(groups.map((g) => g.username)).toEqual(['alice', 'bob']);
  });

  it('returns an empty array for no items', () => {
    expect(groupByAuthor([])).toEqual([]);
  });

  it('carries the author display name alongside the username', () => {
    const items = [new MrItem(makeMr({ author: makeUser({ username: 'alice', name: 'Alice A.' }) }), false)];
    expect(groupByAuthor(items)[0].name).toBe('Alice A.');
  });
});

describe('AuthorGroupItem', () => {
  it('labels the group with author and MR count', () => {
    const items = [new MrItem(makeMr(), false), new MrItem(makeMr({ iid: 2 }), false)];
    const group = new AuthorGroupItem('reviewing', 'main', 'alice', 'Alice A.', items, true);
    expect(group.label).toBe('@alice (2)');
  });

  it('is collapsed when constructed with collapsed=true', () => {
    const group = new AuthorGroupItem('reviewing', 'main', 'alice', 'Alice', [], true);
    expect(group.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
  });

  it('is expanded when constructed with collapsed=false', () => {
    const group = new AuthorGroupItem('reviewing', 'main', 'alice', 'Alice', [], false);
    expect(group.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it('has a stable id keyed by bucket, scope and author, for machine-wide collapse tracking', () => {
    const group = new AuthorGroupItem('needsMyApproval', 'viewed', 'alice', 'Alice', [], true);
    expect(group.id).toBe('group:needsMyApproval:viewed:alice');
  });

  it('exposes bucket/scope/authorUsername for the caller to persist collapse state', () => {
    const group = new AuthorGroupItem('authored', 'main', 'bob', 'Bob', [], true);
    expect(group.bucket).toBe('authored');
    expect(group.scope).toBe('main');
    expect(group.authorUsername).toBe('bob');
  });
});

describe('MrTreeProvider grouping disabled', () => {
  it('returns a flat MrItem list at the root when grouping is disabled', () => {
    const p = new MrTreeProvider('authored', 'empty', () => true, false);
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'me' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'me' }) }), false)
    ]);
    const root = p.getChildren();
    expect(root).toHaveLength(2);
    expect(root.every((n) => n instanceof MrItem)).toBe(true);
  });

  it('returns a flat MrItem list inside the viewed folder too', () => {
    const p = new MrTreeProvider('authored', 'empty', () => true, false);
    p.setItems(
      [],
      [
        new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'me' }) }), false, [], false, true),
        new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'me' }) }), false, [], false, true)
      ]
    );
    const folder = p.getChildren()[0] as ViewedFolderItem;
    const children = p.getChildren(folder);
    expect(children).toHaveLength(2);
    expect(children.every((n) => n instanceof MrItem)).toBe(true);
  });

  it('defaults to grouping enabled when the flag is omitted', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([new MrItem(makeMr(), false)]);
    expect(p.getChildren()[0]).toBeInstanceOf(AuthorGroupItem);
  });
});

describe('MrTreeProvider grouping', () => {
  it('groups root children by author instead of a flat MR list', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }) }), false),
      new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'alice' }) }), false)
    ]);
    const root = p.getChildren();
    expect(root).toHaveLength(2);
    expect(root.every((n) => n instanceof AuthorGroupItem)).toBe(true);
  });

  it('groups are collapsed by default when no collapse-state lookup is supplied', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([new MrItem(makeMr(), false)]);
    const group = p.getChildren()[0] as AuthorGroupItem;
    expect(group.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
  });

  it('expands a group when the injected lookup says it is not collapsed', () => {
    const p = new MrTreeProvider('reviewing', 'empty', (_scope, author) => author === 'alice');
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }) }), false)
    ]);
    const groups = p.getChildren() as AuthorGroupItem[];
    const alice = groups.find((g) => g.authorUsername === 'alice')!;
    const bob = groups.find((g) => g.authorUsername === 'bob')!;
    expect(alice.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
    expect(bob.collapsibleState).toBe(TreeItemCollapsibleState.Expanded);
  });

  it('passes scope="main" for the top-level list and scope="viewed" for the viewed sub-section', () => {
    const seen: { scope: string; author: string }[] = [];
    const p = new MrTreeProvider('reviewing', 'empty', (scope, author) => {
      seen.push({ scope, author });
      return true;
    });
    p.setItems(
      [new MrItem(makeMr({ author: makeUser({ username: 'alice' }) }), false)],
      [new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }) }), false, [], false, true)]
    );
    const root = p.getChildren();
    const folder = root.find((n) => n instanceof ViewedFolderItem)!;
    p.getChildren(folder);

    expect(seen).toContainEqual({ scope: 'main', author: 'alice' });
    expect(seen).toContainEqual({ scope: 'viewed', author: 'bob' });
  });

  it('expanding a group reveals its MrItems', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'alice' }) }), false)
    ]);
    const group = p.getChildren()[0] as AuthorGroupItem;
    const children = p.getChildren(group) as MrItem[];
    expect(children).toHaveLength(2);
    expect(children.every((i) => i instanceof MrItem)).toBe(true);
  });

  it('orders root author groups by latest activity, most recent first', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }), updated_at: iso(72) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }), updated_at: iso(1) }), false)
    ]);
    const groups = p.getChildren() as AuthorGroupItem[];
    expect(groups.map((g) => g.authorUsername)).toEqual(['bob', 'alice']);
  });

  it('the viewed folder still groups its own contents by author', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems(
      [],
      [
        new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'alice' }) }), false, [], false, true),
        new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'bob' }) }), false, [], false, true)
      ]
    );
    const folder = p.getChildren()[0] as ViewedFolderItem;
    const groups = p.getChildren(folder);
    expect(groups).toHaveLength(2);
    expect(groups.every((n) => n instanceof AuthorGroupItem)).toBe(true);
  });
});
