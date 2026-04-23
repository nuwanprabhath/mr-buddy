import * as vscode from 'vscode';
import { GitLabUser, MergeRequest } from './gitlab';

export type BucketId = 'reviewing' | 'needsMyApproval' | 'authored' | 'assigned';

export class MrItem extends vscode.TreeItem {
  constructor(
    public readonly mr: MergeRequest,
    public readonly approvedByMe: boolean,
    approvedByUsers: GitLabUser[] = []
  ) {
    const approvedIds = new Set(approvedByUsers.map((u) => u.id));
    const approvedCount = mr.reviewers.filter((r) => approvedIds.has(r.id)).length;
    const approvalBadge = mr.reviewers.length > 0 ? `[${approvedCount}/${mr.reviewers.length}] ` : '';
    super(`${approvalBadge}${mr.title}`, vscode.TreeItemCollapsibleState.None);
    const pipeline = mr.head_pipeline?.status ? ` • pipeline: ${mr.head_pipeline.status}` : '';
    const conflicts = mr.has_conflicts ? ' ⚠ conflicts' : '';
    const draft = mr.draft || mr.work_in_progress ? ' [DRAFT]' : '';

    this.description = `${mr.references.full} • ${mr.author.username}`;

    const pendingIcon = mr.user_notes_count > 0 ? '💬' : '⏳';
    const reviewerLines = mr.reviewers.length
      ? mr.reviewers.map((r) => `${approvedIds.has(r.id) ? '✅' : pendingIcon} @${r.username}`).join('\n\n')
      : '_No reviewers assigned_';

    const tooltip = new vscode.MarkdownString(
      `**${mr.title}**${draft}\n\n` +
      `${mr.references.full} by @${mr.author.username}\n\n` +
      `\`${mr.source_branch}\` → \`${mr.target_branch}\`${pipeline}${conflicts}\n\n` +
      `💬 ${mr.user_notes_count}  👍 ${mr.upvotes}  👎 ${mr.downvotes}\n\n` +
      `**Reviewers**\n\n${reviewerLines}\n\n` +
      `[Open in browser](${mr.web_url})`
    );
    tooltip.isTrusted = true;
    this.tooltip = tooltip;

    this.iconPath = new vscode.ThemeIcon(
      approvedByMe ? 'check' : mr.has_conflicts ? 'warning' : 'git-pull-request'
    );
    this.contextValue = approvedByMe ? 'mr-approved' : 'mr-unapproved';
    this.command = {
      command: 'mrBuddy.openMr',
      title: 'Open MR',
      arguments: [this]
    };
  }
}

class EmptyItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

export class MrTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private items: MrItem[] = [];
  private loading = false;
  private error: string | undefined;

  constructor(
    public readonly bucket: BucketId,
    private readonly emptyMessage: string
  ) {}

  setItems(items: MrItem[]) {
    this.items = items;
    this.error = undefined;
    this.loading = false;
    this._onDidChange.fire(undefined);
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

  getChildren(): vscode.TreeItem[] {
    if (this.loading) return [new EmptyItem('Loading…')];
    if (this.error) return [new EmptyItem(`Error: ${this.error}`)];
    if (this.items.length === 0) return [new EmptyItem(this.emptyMessage)];
    return this.items;
  }
}
