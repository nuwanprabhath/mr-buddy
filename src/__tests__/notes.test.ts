import { MrItem, MrTreeProvider, mrKey, matchesFilter } from '../treeProvider';
import { MarkdownString } from '../__mocks__/vscode';
import { makeMr, makeUser } from './helpers';

const NOTE = 'Not ready to review yet since a pipeline run needs to be completed.';

function tip(item: MrItem): string {
  return (item.tooltip as MarkdownString).value;
}

describe('mrKey', () => {
  it('combines project id and iid', () => {
    expect(mrKey(makeMr({ project_id: 7, iid: 42 }))).toBe('7:42');
  });

  it('matches the tree item id, so notes and items line up', () => {
    const mr = makeMr({ project_id: 7, iid: 42 });
    expect(new MrItem(mr, false).id).toBe(mrKey(mr));
  });
});

describe('MrItem note', () => {
  it('defaults to an empty note', () => {
    expect(new MrItem(makeMr(), false).note).toBe('');
  });

  it('shows the note in the tooltip', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    expect(tip(item)).toContain(NOTE);
  });

  it('puts the note above the MR metadata so it is seen first', () => {
    const mr = makeMr({ references: { full: 'org/repo!42' } });
    const item = new MrItem(mr, false, [], false, false, new Set(), NOTE);
    const v = tip(item);
    expect(v.indexOf(NOTE)).toBeLessThan(v.indexOf('org/repo!42'));
  });

  it('renders the note as a blockquote with a 📝 marker', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    expect(tip(item)).toContain(`> 📝 ${NOTE}`);
  });

  it('keeps multi-line notes inside the blockquote', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), 'line one\nline two');
    expect(tip(item)).toContain('> 📝 line one  \n> line two');
  });

  it('adds no note block when there is no note', () => {
    expect(tip(new MrItem(makeMr(), false))).not.toContain('📝');
  });

  it('treats a whitespace-only note as no note', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), '   ');
    expect(tip(item)).not.toContain('📝');
    expect(item.contextValue).toContain('nonote');
  });

  it('marks the row description with 📝 so notes are visible without hovering', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    expect(item.description).toMatch(/^📝 /);
  });

  it('leaves the description unmarked when there is no note', () => {
    expect(new MrItem(makeMr(), false).description).not.toContain('📝');
  });
});

describe('MrItem note contextValue', () => {
  it('ends with -hasnote when a note is set', () => {
    const item = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    expect(item.contextValue).toBe('mr-unapproved-unviewed-hasnote');
  });

  it('ends with -nonote when no note is set', () => {
    expect(new MrItem(makeMr(), false).contextValue).toBe('mr-unapproved-unviewed-nonote');
  });

  it('the clear-note menu regex matches only noted items', () => {
    const clearNote = /-hasnote$/;
    const noted = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    const plain = new MrItem(makeMr(), false);
    expect(clearNote.test(noted.contextValue!)).toBe(true);
    expect(clearNote.test(plain.contextValue!)).toBe(false);
  });

  it('the viewed-toggle menu regexes still work with the note segment appended', () => {
    const markViewed = /^mr-[^-]+-unviewed-/;
    const unmarkViewed = /^mr-[^-]+-viewed-/;
    const unviewed = new MrItem(makeMr(), true, [], false, false, new Set(), NOTE);
    const viewed = new MrItem(makeMr(), true, [], false, true, new Set(), NOTE);

    expect(markViewed.test(unviewed.contextValue!)).toBe(true);
    expect(unmarkViewed.test(unviewed.contextValue!)).toBe(false);

    expect(unmarkViewed.test(viewed.contextValue!)).toBe(true);
    expect(markViewed.test(viewed.contextValue!)).toBe(false);
  });
});

describe('MrItem.withNote', () => {
  it('returns an item carrying the new note', () => {
    expect(new MrItem(makeMr(), false).withNote(NOTE).note).toBe(NOTE);
  });

  it('clears the note when given an empty string', () => {
    const noted = new MrItem(makeMr(), false, [], false, false, new Set(), NOTE);
    expect(noted.withNote('').note).toBe('');
    expect(noted.withNote('').contextValue).toContain('nonote');
  });

  it('preserves every other field', () => {
    const reviewers = [makeUser({ id: 10 })];
    const approvedBy = [makeUser({ id: 10 })];
    const original = new MrItem(makeMr({ reviewers }), true, approvedBy, true, true, new Set([10]));
    const updated = original.withNote(NOTE);

    expect(updated.mr).toBe(original.mr);
    expect(updated.approvedByMe).toBe(original.approvedByMe);
    expect(updated.approvedByUsers).toBe(original.approvedByUsers);
    expect(updated.highlight).toBe(original.highlight);
    expect(updated.viewed).toBe(original.viewed);
    expect(updated.commentedByUserIds).toBe(original.commentedByUserIds);
    expect(updated.id).toBe(original.id);
    // approval badge and reviewer icons survive the rebuild
    expect((updated.tooltip as MarkdownString).value).toContain('✅ @alice');
  });
});

describe('MrTreeProvider.setNote', () => {
  function provider() {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems(
      [new MrItem(makeMr({ project_id: 1, iid: 1 }), false)],
      [new MrItem(makeMr({ project_id: 1, iid: 2 }), false, [], false, true)]
    );
    return p;
  }

  it('applies a note to the matching item', () => {
    const p = provider();
    expect(p.setNote('1:1', NOTE)).toBe(true);
    expect((p.getChildren()[0] as MrItem).note).toBe(NOTE);
  });

  it('applies a note to an item in the viewed sub-section', () => {
    const p = provider();
    expect(p.setNote('1:2', NOTE)).toBe(true);
    const folder = p.getChildren()[1];
    expect((p.getChildren(folder)[0] as MrItem).note).toBe(NOTE);
  });

  it('returns false when this section does not hold the MR', () => {
    expect(provider().setNote('9:99', NOTE)).toBe(false);
  });

  it('leaves other items untouched', () => {
    const p = provider();
    p.setNote('1:1', NOTE);
    const folder = p.getChildren()[1];
    expect((p.getChildren(folder)[0] as MrItem).note).toBe('');
  });

  it('clears a note when given an empty string', () => {
    const p = provider();
    p.setNote('1:1', NOTE);
    p.setNote('1:1', '');
    expect((p.getChildren()[0] as MrItem).note).toBe('');
  });
});

describe('notes are searchable', () => {
  it('matchesFilter matches text inside the note', () => {
    expect(matchesFilter(makeMr(), 'pipeline', NOTE)).toBe(true);
  });

  it('does not match when the note lacks the term', () => {
    expect(matchesFilter(makeMr(), 'pipeline', 'something else')).toBe(false);
  });

  it('the provider filters on notes', () => {
    const p = new MrTreeProvider('reviewing', 'empty');
    p.setItems([
      new MrItem(makeMr({ iid: 1 }), false, [], false, false, new Set(), NOTE),
      new MrItem(makeMr({ iid: 2 }), false)
    ]);
    p.setFilter('pipeline');
    const children = p.getChildren() as MrItem[];
    expect(children).toHaveLength(1);
    expect(children[0].mr.iid).toBe(1);
  });
});
