import { MrItem } from '../treeProvider';
import { MarkdownString, ThemeIcon } from '../__mocks__/vscode';
import { makeMr, makeUser } from './helpers';

function labelText(item: MrItem): string {
  const l = item.label;
  if (typeof l === 'string') return l;
  return (l as any).label;
}

describe('MrItem label', () => {
  it('starts with the MR iid', () => {
    const item = new MrItem(makeMr({ iid: 99 }), false);
    expect(labelText(item)).toMatch(/^!99\b/);
  });

  it('includes the author username', () => {
    const item = new MrItem(makeMr({ author: makeUser({ username: 'bob' }) }), false);
    expect(labelText(item)).toContain('@bob');
  });

  it('includes the MR title', () => {
    const item = new MrItem(makeMr({ title: 'My cool feature' }), false);
    expect(labelText(item)).toContain('My cool feature');
  });

  it('follows order: iid • author • title', () => {
    const mr = makeMr({ iid: 5, author: makeUser({ username: 'carol' }), title: 'Some work' });
    const text = labelText(new MrItem(mr, false));
    const iidPos = text.indexOf('!5');
    const authorPos = text.indexOf('@carol');
    const titlePos = text.indexOf('Some work');
    expect(iidPos).toBeLessThan(authorPos);
    expect(authorPos).toBeLessThan(titlePos);
  });

  it('omits approval badge when no reviewers', () => {
    const item = new MrItem(makeMr({ reviewers: [] }), false);
    expect(labelText(item)).not.toMatch(/\[\d+\/\d+\]/);
  });

  it('shows [0/N] when reviewers present but none approved', () => {
    const reviewers = [makeUser({ id: 10 }), makeUser({ id: 11 })];
    const item = new MrItem(makeMr({ reviewers }), false, []);
    expect(labelText(item)).toContain('[0/2]');
  });

  it('shows correct approval count', () => {
    const reviewers = [makeUser({ id: 10 }), makeUser({ id: 11 }), makeUser({ id: 12 })];
    const approvedByUsers = [makeUser({ id: 10 }), makeUser({ id: 11 })];
    const item = new MrItem(makeMr({ reviewers }), false, approvedByUsers);
    expect(labelText(item)).toContain('[2/3]');
  });

  it('only counts reviewers in the approval badge, not non-reviewer approvers', () => {
    const reviewers = [makeUser({ id: 10 })];
    // id:99 approved but is not a reviewer
    const approvedByUsers = [makeUser({ id: 10 }), makeUser({ id: 99 })];
    const item = new MrItem(makeMr({ reviewers }), false, approvedByUsers);
    expect(labelText(item)).toContain('[1/1]');
  });

  it('uses highlighted label object when highlight=true', () => {
    const item = new MrItem(makeMr(), false, [], true);
    expect(typeof item.label).toBe('object');
    expect((item.label as any).highlights).toBeDefined();
  });

  it('uses plain string label when highlight=false', () => {
    const item = new MrItem(makeMr(), false, [], false);
    expect(typeof item.label).toBe('string');
  });
});

describe('MrItem description', () => {
  it('contains the project path without the MR reference', () => {
    const mr = makeMr({ iid: 42, references: { full: 'mygroup/myrepo!42' } });
    const item = new MrItem(mr, false);
    expect(item.description).toContain('mygroup/myrepo');
    expect(item.description).not.toContain('!42');
  });

  it('contains a relative date', () => {
    const mr = makeMr({ created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() });
    const item = new MrItem(mr, false);
    expect(item.description).toContain('5 days ago');
  });
});

describe('MrItem tooltip', () => {
  it('contains the MR title', () => {
    const item = new MrItem(makeMr({ title: 'My feature' }), false);
    expect((item.tooltip as MarkdownString).value).toContain('My feature');
  });

  it('contains the full reference', () => {
    const mr = makeMr({ references: { full: 'org/repo!42' } });
    const item = new MrItem(mr, false);
    expect((item.tooltip as MarkdownString).value).toContain('org/repo!42');
  });

  it('contains the author username', () => {
    const mr = makeMr({ author: makeUser({ username: 'dave' }) });
    const item = new MrItem(mr, false);
    expect((item.tooltip as MarkdownString).value).toContain('@dave');
  });

  it('contains "opened" with a relative date', () => {
    const mr = makeMr({ created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() });
    const item = new MrItem(mr, false);
    expect((item.tooltip as MarkdownString).value).toContain('opened 3 days ago');
  });

  it('contains source and target branches', () => {
    const mr = makeMr({ source_branch: 'feat-x', target_branch: 'dev' });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('feat-x');
    expect(tooltipVal).toContain('dev');
  });

  it('contains pipeline status when present', () => {
    const mr = makeMr({ head_pipeline: { status: 'running' } });
    const item = new MrItem(mr, false);
    expect((item.tooltip as MarkdownString).value).toContain('pipeline: running');
  });

  it('omits pipeline info when head_pipeline is null', () => {
    const item = new MrItem(makeMr({ head_pipeline: null }), false);
    expect((item.tooltip as MarkdownString).value).not.toContain('pipeline');
  });

  it('shows conflict warning when has_conflicts', () => {
    const item = new MrItem(makeMr({ has_conflicts: true }), false);
    expect((item.tooltip as MarkdownString).value).toContain('conflicts');
  });

  it('shows [DRAFT] when draft', () => {
    const item = new MrItem(makeMr({ draft: true }), false);
    expect((item.tooltip as MarkdownString).value).toContain('[DRAFT]');
  });

  it('shows reviewer list with approval status', () => {
    const reviewers = [makeUser({ id: 10, username: 'reviewer1' }), makeUser({ id: 11, username: 'reviewer2' })];
    const approvedByUsers = [makeUser({ id: 10, username: 'reviewer1' })];
    const item = new MrItem(makeMr({ reviewers }), false, approvedByUsers);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('✅ @reviewer1');
    expect(tooltipVal).toContain('@reviewer2');
  });

  it('shows "No reviewers assigned" when reviewers list is empty', () => {
    const item = new MrItem(makeMr({ reviewers: [] }), false);
    expect((item.tooltip as MarkdownString).value).toContain('No reviewers assigned');
  });

  it('has isTrusted set to true', () => {
    const item = new MrItem(makeMr(), false);
    expect((item.tooltip as MarkdownString).isTrusted).toBe(true);
  });
});

describe('MrItem icon and contextValue', () => {
  it('uses check icon when approvedByMe', () => {
    const item = new MrItem(makeMr(), true);
    expect((item.iconPath as ThemeIcon).id).toBe('check');
  });

  it('uses warning icon when has_conflicts and not approvedByMe', () => {
    const item = new MrItem(makeMr({ has_conflicts: true }), false);
    expect((item.iconPath as ThemeIcon).id).toBe('warning');
  });

  it('uses git-pull-request icon by default', () => {
    const item = new MrItem(makeMr(), false);
    expect((item.iconPath as ThemeIcon).id).toBe('git-pull-request');
  });

  it('sets contextValue to mr-approved when approvedByMe', () => {
    expect(new MrItem(makeMr(), true).contextValue).toBe('mr-approved');
  });

  it('sets contextValue to mr-unapproved when not approvedByMe', () => {
    expect(new MrItem(makeMr(), false).contextValue).toBe('mr-unapproved');
  });
});
