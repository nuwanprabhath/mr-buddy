import { MrItem, extractTicketNumber, buildIssueUrl } from '../treeProvider';
import { MarkdownString, ThemeIcon } from '../__mocks__/vscode';
import { makeMr, makeUser } from './helpers';

function labelText(item: MrItem): string {
  const l = item.label;
  if (typeof l === 'string') return l;
  return (l as any).label;
}

describe('extractTicketNumber', () => {
  it('extracts a ticket number from the title', () => {
    expect(extractTicketNumber('feat: #2317 species list field migration')).toBe('2317');
  });

  it('returns null when no ticket number is present in title or description', () => {
    expect(extractTicketNumber('feat: species list field migration')).toBeNull();
  });

  it('extracts the first ticket number when multiple are present in title', () => {
    expect(extractTicketNumber('fix: #100 relates to #200')).toBe('100');
  });

  it('falls back to description "Closes #N" when title has no ticket number', () => {
    expect(extractTicketNumber('Site/transect project-based filtering', 'Closes #2176')).toBe('2176');
  });

  it('finds ticket from "Fixes #N" in description', () => {
    expect(extractTicketNumber('My feature', 'Fixes #999')).toBe('999');
  });

  it('finds ticket from "Resolves #N" in description', () => {
    expect(extractTicketNumber('My feature', 'Resolves #42')).toBe('42');
  });

  it('prefers title match over description', () => {
    expect(extractTicketNumber('fix: #100 my thing', 'Closes #200')).toBe('100');
  });

  it('returns null when neither title nor description has a ticket number', () => {
    expect(extractTicketNumber('no ticket here', 'just some description')).toBeNull();
  });
});

describe('buildIssueUrl', () => {
  it('replaces the merge_requests path segment with the issues path', () => {
    const url = buildIssueUrl('https://gitlab.example.com/org/repo/-/merge_requests/42', '2317');
    expect(url).toBe('https://gitlab.example.com/org/repo/-/issues/2317');
  });
});

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

  it('contains the relative updated date, not the created date', () => {
    const mr = makeMr({
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
    });
    const item = new MrItem(mr, false);
    expect(item.description).toContain('updated 5 days ago');
    expect(item.description).not.toContain('30 days ago');
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

  it('contains "updated" with a relative date, independent of opened date', () => {
    const mr = makeMr({
      created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('opened 20 days ago');
    expect(tooltipVal).toContain('updated 2 hours ago');
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

  it('makes the ticket number a clickable link to the issue', () => {
    const mr = makeMr({
      title: 'feat: #2317 species list field migration',
      web_url: 'https://gitlab.example.com/org/repo/-/merge_requests/42'
    });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('[#2317](https://gitlab.example.com/org/repo/-/issues/2317)');
  });

  it('adds a "Copy ticket link" action when a ticket number is present', () => {
    const mr = makeMr({ title: 'feat: #2317 species list field migration' });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('Copy ticket link');
    expect(tooltipVal).toContain('command:mrBuddy.copyText');
  });

  it('omits ticket link and copy action when title has no ticket number', () => {
    const mr = makeMr({ title: 'feat: species list field migration', description: '' });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).not.toContain('Copy ticket link');
  });

  it('shows ticket link from description "Closes #N" when title has no ticket number', () => {
    const mr = makeMr({
      title: 'Site/transect project-based filtering',
      description: 'Closes #2176',
      web_url: 'https://gitlab.example.com/org/repo/-/merge_requests/1007'
    });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('[#2176](https://gitlab.example.com/org/repo/-/issues/2176)');
    expect(tooltipVal).toContain('Copy ticket link');
  });

  it('adds a "Copy branch name" action with the source branch encoded', () => {
    const mr = makeMr({ source_branch: 'feature/my-branch' });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('Copy branch name');
    expect(tooltipVal).toContain(encodeURIComponent(JSON.stringify(['feature/my-branch'])));
  });

  it('orders copy buttons: MR link, ticket link, branch name', () => {
    const mr = makeMr({ title: 'fix: #2783 add test and fallback' });
    const item = new MrItem(mr, false);
    const v = (item.tooltip as MarkdownString).value;
    expect(v.indexOf('Copy MR link')).toBeLessThan(v.indexOf('Copy ticket link'));
    expect(v.indexOf('Copy ticket link')).toBeLessThan(v.indexOf('Copy branch name'));
  });

  it('keeps MR link before branch name when there is no ticket number', () => {
    const mr = makeMr({ title: 'no ticket here', description: '' });
    const item = new MrItem(mr, false);
    const v = (item.tooltip as MarkdownString).value;
    expect(v).not.toContain('Copy ticket link');
    expect(v.indexOf('Copy MR link')).toBeLessThan(v.indexOf('Copy branch name'));
  });

  it('enables theme icons on the tooltip for the copy icons', () => {
    const item = new MrItem(makeMr(), false);
    expect((item.tooltip as MarkdownString).supportThemeIcons).toBe(true);
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

  it('adds a "Copy MR link" action with the MR web_url encoded', () => {
    const mr = makeMr({ web_url: 'https://gitlab.example.com/org/repo/-/merge_requests/42' });
    const item = new MrItem(mr, false);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('Copy MR link');
    expect(tooltipVal).toContain(encodeURIComponent(JSON.stringify(['https://gitlab.example.com/org/repo/-/merge_requests/42'])));
  });

  it('shows 💬 only for a reviewer who actually commented, not all unapproved reviewers', () => {
    const reviewers = [makeUser({ id: 10, username: 'alice' }), makeUser({ id: 11, username: 'bob' })];
    const commentedByUserIds = new Set([11]);
    const item = new MrItem(makeMr({ reviewers }), false, [], false, false, commentedByUserIds);
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('⏳ @alice');
    expect(tooltipVal).toContain('💬 @bob');
  });

  it('shows ⏳ for all unapproved reviewers when none have commented', () => {
    const reviewers = [makeUser({ id: 10, username: 'alice' }), makeUser({ id: 11, username: 'bob' })];
    const item = new MrItem(makeMr({ reviewers }), false, [], false, false, new Set());
    const tooltipVal = (item.tooltip as MarkdownString).value;
    expect(tooltipVal).toContain('⏳ @alice');
    expect(tooltipVal).toContain('⏳ @bob');
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

  it('contextValue is mr-approved-unviewed when approved and not viewed', () => {
    expect(new MrItem(makeMr(), true, [], false, false).contextValue).toBe('mr-approved-unviewed-nonote');
  });

  it('contextValue is mr-unapproved-unviewed by default', () => {
    expect(new MrItem(makeMr(), false).contextValue).toBe('mr-unapproved-unviewed-nonote');
  });

  it('contextValue is mr-approved-viewed when approved and viewed', () => {
    expect(new MrItem(makeMr(), true, [], false, true).contextValue).toBe('mr-approved-viewed-nonote');
  });

  it('contextValue is mr-unapproved-viewed when not approved but viewed', () => {
    expect(new MrItem(makeMr(), false, [], false, true).contextValue).toBe('mr-unapproved-viewed-nonote');
  });
});

describe('MrItem stable id', () => {
  it('id is derived from project_id and iid', () => {
    const item = new MrItem(makeMr({ project_id: 7, iid: 42 }), false);
    expect(item.id).toBe('7:42');
  });

  it('id stays the same across approval/viewed state changes (so VS Code can diff in place)', () => {
    const mr = makeMr({ project_id: 7, iid: 42 });
    const unviewed = new MrItem(mr, false);
    const viewed = new MrItem(mr, true, [], false, true);
    expect(unviewed.id).toBe(viewed.id);
  });
});

describe('MrItem viewed flag', () => {
  it('viewed is false by default', () => {
    expect(new MrItem(makeMr(), false).viewed).toBe(false);
  });

  it('viewed is true when passed true', () => {
    expect(new MrItem(makeMr(), false, [], false, true).viewed).toBe(true);
  });
});
