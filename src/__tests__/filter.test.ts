import { MrItem, MrTreeProvider, ViewedFolderItem, matchesFilter } from '../treeProvider';
import { makeMr, makeUser } from './helpers';

describe('matchesFilter', () => {
  const mr = makeMr({
    iid: 1131,
    title: 'test: #2796 report ambiguous dropdown matches',
    author: makeUser({ username: 'tokmakoff', name: 'Alex Tokmakoff' }),
    references: { full: 'ternandsparrow/paratoo-fdcp!1131' },
    source_branch: '2796-dropdown-fix',
    target_branch: 'dev/1.0.11'
  });

  it('matches everything when the filter is empty', () => {
    expect(matchesFilter(mr, '')).toBe(true);
    expect(matchesFilter(mr, '   ')).toBe(true);
  });

  it('matches on author username', () => {
    expect(matchesFilter(mr, 'tokmakoff')).toBe(true);
  });

  it('matches on author display name', () => {
    expect(matchesFilter(mr, 'alex')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(matchesFilter(mr, 'TOKMAKOFF')).toBe(true);
  });

  it('matches on title text', () => {
    expect(matchesFilter(mr, 'dropdown')).toBe(true);
  });

  it('matches on MR number with the ! prefix', () => {
    expect(matchesFilter(mr, '!1131')).toBe(true);
  });

  it('matches on bare MR number', () => {
    expect(matchesFilter(mr, '1131')).toBe(true);
  });

  it('matches on project path', () => {
    expect(matchesFilter(mr, 'paratoo-fdcp')).toBe(true);
  });

  it('matches on source branch', () => {
    expect(matchesFilter(mr, '2796-dropdown')).toBe(true);
  });

  it('matches on target branch', () => {
    expect(matchesFilter(mr, 'dev/1.0.11')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesFilter(mr, 'zzzznope')).toBe(false);
  });

  it('requires all terms to match (AND semantics)', () => {
    expect(matchesFilter(mr, 'tokmakoff dropdown')).toBe(true);
    expect(matchesFilter(mr, 'tokmakoff zzzznope')).toBe(false);
  });

  describe('@ prefix restricts matching to the author', () => {
    it('matches when the author matches', () => {
      expect(matchesFilter(mr, '@tokmakoff')).toBe(true);
    });

    it('does not match a title word that is not the author', () => {
      expect(matchesFilter(mr, '@dropdown')).toBe(false);
    });

    it('can be combined with a free-text term', () => {
      expect(matchesFilter(mr, '@tokmakoff dropdown')).toBe(true);
      expect(matchesFilter(mr, '@jinadl dropdown')).toBe(false);
    });
  });
});

describe('MrTreeProvider filtering', () => {
  function provider() {
    const p = new MrTreeProvider('reviewing', 'No MRs awaiting your review.');
    p.setItems([
      new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'tokmakoff', name: 'Alex' }) }), false),
      new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'jinadl', name: 'Jin Zhou' }) }), false),
      new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'tokmakoff', name: 'Alex' }) }), false)
    ]);
    return p;
  }

  it('returns all items when no filter is set', () => {
    expect(provider().getChildren()).toHaveLength(3);
  });

  it('returns only matching items when a filter is set', () => {
    const p = provider();
    p.setFilter('tokmakoff');
    const children = p.getChildren() as MrItem[];
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.mr.author.username === 'tokmakoff')).toBe(true);
  });

  it('shows a "no match" message when the filter excludes everything', () => {
    const p = provider();
    p.setFilter('zzzznope');
    const children = p.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].label).toContain('No MRs match');
  });

  it('shows the plain empty message when there is no data and no filter', () => {
    const p = new MrTreeProvider('reviewing', 'No MRs awaiting your review.');
    p.setItems([]);
    expect(p.getChildren()[0].label).toBe('No MRs awaiting your review.');
  });

  it('reports matched and total counts', () => {
    const p = provider();
    expect(p.counts).toEqual({ matched: 3, total: 3 });
    p.setFilter('jinadl');
    expect(p.counts).toEqual({ matched: 1, total: 3 });
  });

  it('filters the viewed sub-section too', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems(
      [new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'tokmakoff' }) }), false)],
      [
        new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'tokmakoff' }) }), false, [], false, true),
        new MrItem(makeMr({ iid: 3, author: makeUser({ username: 'jinadl' }) }), false, [], false, true)
      ]
    );
    p.setFilter('jinadl');
    const root = p.getChildren();
    // only the viewed folder survives — the main item is filtered out
    expect(root).toHaveLength(1);
    expect(root[0]).toBeInstanceOf(ViewedFolderItem);
    expect(p.getChildren(root[0])).toHaveLength(1);
  });

  it('counts include viewed items', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems(
      [new MrItem(makeMr({ iid: 1, author: makeUser({ username: 'tokmakoff' }) }), false)],
      [new MrItem(makeMr({ iid: 2, author: makeUser({ username: 'jinadl' }) }), false, [], false, true)]
    );
    expect(p.counts).toEqual({ matched: 2, total: 2 });
    p.setFilter('tokmakoff');
    expect(p.counts).toEqual({ matched: 1, total: 2 });
  });
});
