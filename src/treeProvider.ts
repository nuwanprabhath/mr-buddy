import * as vscode from 'vscode';
import { GitLabUser, MergeRequest } from './gitlab';

export type BucketId = 'reviewing' | 'needsMyApproval' | 'authored' | 'assigned';

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function extractTicketNumber(title: string, description?: string): string | null {
  const titleMatch = title.match(/#(\d+)/);
  if (titleMatch) return titleMatch[1];
  if (description) {
    // GitLab closing keywords: Closes, Fixes, Resolves, Implements (case-insensitive)
    const descMatch = description.match(/(?:closes?|fixes?|resolves?|implements?)\s+#(\d+)/i);
    if (descMatch) return descMatch[1];
    // Fallback: any bare #NNN in description
    const bareMatch = description.match(/#(\d+)/);
    if (bareMatch) return bareMatch[1];
  }
  return null;
}

export function buildIssueUrl(webUrl: string, ticketNumber: string): string {
  return webUrl.replace(/\/-\/merge_requests\/\d+\/?$/, `/-/issues/${ticketNumber}`);
}

/** Stable identity for an MR across refreshes, worktrees and windows. */
export function mrKey(mr: Pick<MergeRequest, 'project_id' | 'iid'>): string {
  return `${mr.project_id}:${mr.iid}`;
}

function copyCommandLink(label: string, text: string): string {
  const args = encodeURIComponent(JSON.stringify([text]));
  return `[$(copy) ${label}](command:mrBuddy.copyText?${args})`;
}

export class MrItem extends vscode.TreeItem {
  constructor(
    public readonly mr: MergeRequest,
    public readonly approvedByMe: boolean,
    public readonly approvedByUsers: GitLabUser[] = [],
    public readonly highlight: boolean = false,
    public readonly viewed: boolean = false,
    public readonly commentedByUserIds: Set<number> = new Set(),
    public readonly note: string = ''
  ) {
    const approvedIds = new Set(approvedByUsers.map((u) => u.id));
    const approvedCount = mr.reviewers.filter((r) => approvedIds.has(r.id)).length;
    const approvalBadge = mr.reviewers.length > 0 ? `[${approvedCount}/${mr.reviewers.length}] ` : '';
    const project = mr.references.full.replace(/![0-9]+$/, '');
    const labelText = `!${mr.iid} • @${mr.author.username} • ${approvalBadge}${mr.title}`;
    super(
      highlight ? { label: labelText, highlights: [[0, labelText.length]] } : labelText,
      vscode.TreeItemCollapsibleState.None
    );
    // Stable id lets VS Code diff tree updates in place instead of tearing down
    // and recreating rows on every refresh (which causes a visible flicker).
    this.id = mrKey(mr);
    const pipeline = mr.head_pipeline?.status ? ` • pipeline: ${mr.head_pipeline.status}` : '';
    const conflicts = mr.has_conflicts ? ' ⚠ conflicts' : '';
    const draft = mr.draft || mr.work_in_progress ? ' [DRAFT]' : '';

    const noteMark = note.trim() ? '📝 ' : '';
    this.description = `${noteMark}${project} • updated ${relativeTime(mr.updated_at)}`;

    const reviewerLine = mr.reviewers.length
      ? mr.reviewers
          .map((r) => {
            const icon = approvedIds.has(r.id) ? '✅' : commentedByUserIds.has(r.id) ? '💬' : '⏳';
            return `${icon} @${r.username}`;
          })
          .join('  •  ')
      : '_No reviewers assigned_';

    const ticketNumber = extractTicketNumber(mr.title, mr.description);
    const issueUrl = ticketNumber ? buildIssueUrl(mr.web_url, ticketNumber) : null;
    const ticketInTitle = ticketNumber ? mr.title.includes(`#${ticketNumber}`) : false;
    const titleWithTicketLink =
      ticketNumber && issueUrl && ticketInTitle
        ? mr.title.replace(`#${ticketNumber}`, `[#${ticketNumber}](${issueUrl})`)
        : mr.title;
    // When the ticket is in the description (not the title) show the issue link explicitly
    const ticketRef = issueUrl && !ticketInTitle ? `[#${ticketNumber}](${issueUrl})  ` : '';
    const ticketCopyBtn = issueUrl ? `  ${ticketRef}${copyCommandLink('Copy ticket link', issueUrl)}` : '';

    const copyButtons =
      `${copyCommandLink('Copy MR link', mr.web_url)}` +
      ticketCopyBtn +
      `  ${copyCommandLink('Copy branch name', mr.source_branch)}`;

    // Your own note goes first — it is the reason you hovered in the first place.
    const noteBlock = note.trim() ? `> 📝 ${note.trim().replace(/\n/g, '  \n> ')}\n\n` : '';

    const tooltip = new vscode.MarkdownString(
      `**${titleWithTicketLink}**${draft}\n\n` +
      noteBlock +
      `${mr.references.full} by @${mr.author.username}  \n` +
      `opened ${relativeTime(mr.created_at)} • updated ${relativeTime(mr.updated_at)}\n\n` +
      `\`${mr.source_branch}\` → \`${mr.target_branch}\`${pipeline}${conflicts}\n\n` +
      `${copyButtons}\n\n` +
      `💬 ${mr.user_notes_count}  👍 ${mr.upvotes}  👎 ${mr.downvotes}\n\n` +
      `**Reviewers:** ${reviewerLine}\n\n` +
      `[Open in browser](${mr.web_url})`
    );
    tooltip.isTrusted = true;
    tooltip.supportThemeIcons = true;
    this.tooltip = tooltip;

    this.iconPath = new vscode.ThemeIcon(
      approvedByMe ? 'check' : mr.has_conflicts ? 'warning' : 'git-pull-request'
    );
    const approvedPart = approvedByMe ? 'approved' : 'unapproved';
    const viewedPart = viewed ? 'viewed' : 'unviewed';
    const notePart = note.trim() ? 'hasnote' : 'nonote';
    this.contextValue = `mr-${approvedPart}-${viewedPart}-${notePart}`;
    this.command = {
      command: 'mrBuddy.openMr',
      title: 'Open MR',
      arguments: [this]
    };
  }

  /** Same MR, different note — lets us update a note without refetching from GitLab. */
  withNote(note: string): MrItem {
    return new MrItem(
      this.mr,
      this.approvedByMe,
      this.approvedByUsers,
      this.highlight,
      this.viewed,
      this.commentedByUserIds,
      note
    );
  }

  get key(): string {
    return mrKey(this.mr);
  }
}

export class ViewedFolderItem extends vscode.TreeItem {
  constructor(count: number) {
    super(`Viewed (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = 'viewed-folder';
    this.iconPath = new vscode.ThemeIcon('eye');
    this.contextValue = 'viewed-folder';
  }
}

class EmptyItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

/**
 * Matches an MR against a free-text query. Every whitespace-separated term must
 * match somewhere (AND), so "jin fix" narrows to Jin's fixes. A term prefixed
 * with `@` is matched against the author only, e.g. "@tokmakoff".
 */
export function matchesFilter(mr: MergeRequest, filter: string, note: string = ''): boolean {
  const terms = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const author = `${mr.author.username} ${mr.author.name}`.toLowerCase();
  const haystack = [
    author,
    mr.title,
    `!${mr.iid}`,
    mr.references.full,
    mr.source_branch,
    mr.target_branch,
    note
  ]
    .join(' ')
    .toLowerCase();

  return terms.every((term) =>
    term.startsWith('@') ? author.includes(term.slice(1)) : haystack.includes(term)
  );
}

export class MrTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private items: MrItem[] = [];
  private viewedItems: MrItem[] = [];
  private loading = false;
  private error: string | undefined;
  private filter = '';

  constructor(
    public readonly bucket: BucketId,
    private readonly emptyMessage: string
  ) {}

  setItems(items: MrItem[], viewedItems: MrItem[] = []) {
    this.items = items;
    this.viewedItems = viewedItems;
    this.error = undefined;
    this.loading = false;
    this._onDidChange.fire(undefined);
  }

  /**
   * Swaps in a new note for one MR without refetching from GitLab.
   * Returns true if this section actually held that MR.
   */
  setNote(key: string, note: string): boolean {
    let changed = false;
    const apply = (arr: MrItem[]) =>
      arr.map((i) => {
        if (i.key !== key) return i;
        changed = true;
        return i.withNote(note);
      });
    const items = apply(this.items);
    const viewedItems = apply(this.viewedItems);
    if (!changed) return false;
    this.items = items;
    this.viewedItems = viewedItems;
    this._onDidChange.fire(undefined);
    return true;
  }

  setFilter(filter: string) {
    this.filter = filter;
    this._onDidChange.fire(undefined);
  }

  private applyFilter(items: MrItem[]): MrItem[] {
    if (!this.filter.trim()) return items;
    return items.filter((i) => matchesFilter(i.mr, this.filter, i.note));
  }

  /** Counts used to annotate the view header, e.g. "3 of 12". */
  get counts(): { matched: number; total: number } {
    const total = this.items.length + this.viewedItems.length;
    const matched = this.applyFilter(this.items).length + this.applyFilter(this.viewedItems).length;
    return { matched, total };
  }

  setLoading() {
    this.loading = true;
    this.error = undefined;
    this._onDidChange.fire(undefined);
  }

  setError(msg: string) {
    this.error = msg;
    this.loading = false;
    this._onDidChange.fire(undefined);
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem {
    return el;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element instanceof ViewedFolderItem) {
      return this.applyFilter(this.viewedItems);
    }
    const items = this.applyFilter(this.items);
    const viewedItems = this.applyFilter(this.viewedItems);
    const hasFetched = this.items.length > 0 || this.viewedItems.length > 0;
    const hasContent = items.length > 0 || viewedItems.length > 0;
    // Keep showing existing content while a background refresh is in flight —
    // only fall back to the Loading placeholder on the very first load.
    if (this.loading && !hasFetched) return [new EmptyItem('Loading…')];
    if (this.error && !hasFetched) return [new EmptyItem(`Error: ${this.error}`)];
    if (!hasContent) {
      // Distinguish "nothing here" from "nothing matched your filter"
      const msg = hasFetched && this.filter.trim() ? `No MRs match "${this.filter}".` : this.emptyMessage;
      return [new EmptyItem(msg)];
    }
    const root: vscode.TreeItem[] = [...items];
    if (viewedItems.length > 0) {
      root.push(new ViewedFolderItem(viewedItems.length));
    }
    return root;
  }
}
