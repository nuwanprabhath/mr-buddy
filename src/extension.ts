import * as vscode from 'vscode';
import { GitLabClient, MergeRequest, GitLabUser } from './gitlab';
import { MrTreeProvider, MrItem, ViewedFolderItem, BucketId } from './treeProvider';

const SECRET_KEY = 'mrBuddy.gitlabToken';
const VIEWED_STORE_KEY = 'mrBuddy.viewedStore';

let client: GitLabClient | undefined;
let currentUser: GitLabUser | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let extensionContext: vscode.ExtensionContext;

// key: "projectId:iid", value: updated_at at time of marking viewed
let viewedStore: Map<string, string> = new Map();

function viewedKey(mr: MergeRequest): string {
  return `${mr.project_id}:${mr.iid}`;
}

function loadViewedStore() {
  const saved = extensionContext.globalState.get<Record<string, string>>(VIEWED_STORE_KEY) ?? {};
  viewedStore = new Map(Object.entries(saved));
}

function saveViewedStore() {
  extensionContext.globalState.update(VIEWED_STORE_KEY, Object.fromEntries(viewedStore));
}

const providers: Record<BucketId, MrTreeProvider> = {
  reviewing: new MrTreeProvider('reviewing', 'No MRs awaiting your review.'),
  needsMyApproval: new MrTreeProvider('needsMyApproval', '🎉 All clear — nothing needs your approval.'),
  authored: new MrTreeProvider('authored', 'No open MRs authored by you.'),
  assigned: new MrTreeProvider('assigned', 'No MRs assigned to you.')
};

const treeViews: Partial<Record<BucketId, vscode.TreeView<vscode.TreeItem>>> = {};

let filterText = '';

/** Applies the filter to every section and annotates each view header with the match count. */
function applyFilter(text: string) {
  filterText = text;
  vscode.commands.executeCommand('setContext', 'mrBuddy.filterActive', text.trim().length > 0);
  for (const bucket of Object.keys(providers) as BucketId[]) {
    providers[bucket].setFilter(text);
  }
  updateViewHeaders();
}

function updateViewHeaders() {
  const active = filterText.trim().length > 0;
  for (const bucket of Object.keys(providers) as BucketId[]) {
    const view = treeViews[bucket];
    if (!view) continue;
    const { matched, total } = providers[bucket].counts;
    view.description = active ? `${matched} of ${total} — ${filterText}` : undefined;
  }
}

/** Live search box: the tree filters as you type, no need to press Enter. */
function showFilterBox() {
  const box = vscode.window.createInputBox();
  box.title = 'Filter merge requests';
  box.placeholder = 'author, title, !number, project or branch — prefix @ to match author only';
  box.value = filterText;
  box.onDidChangeValue((v) => applyFilter(v));
  box.onDidAccept(() => box.hide());
  box.onDidHide(() => box.dispose());
  box.show();
}

export async function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  loadViewedStore();

  for (const bucket of Object.keys(providers) as BucketId[]) {
    treeViews[bucket] = vscode.window.createTreeView(`mrBuddy.${bucket}`, {
      treeDataProvider: providers[bucket]
    });
    context.subscriptions.push(treeViews[bucket]!);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('mrBuddy.filter', () => showFilterBox()),
    vscode.commands.registerCommand('mrBuddy.clearFilter', () => applyFilter('')),
    vscode.commands.registerCommand('mrBuddy.signIn', () => signIn(context)),
    vscode.commands.registerCommand('mrBuddy.signOut', () => signOut(context)),
    vscode.commands.registerCommand('mrBuddy.refresh', () => refreshAll()),
    vscode.commands.registerCommand('mrBuddy.openMr', (item?: MrItem) => {
      if (item?.mr) vscode.env.openExternal(vscode.Uri.parse(item.mr.web_url));
    }),
    vscode.commands.registerCommand('mrBuddy.copyMrUrl', (item?: MrItem) => {
      if (item?.mr) {
        vscode.env.clipboard.writeText(item.mr.web_url);
        vscode.window.showInformationMessage('MR URL copied to clipboard.');
      }
    }),
    vscode.commands.registerCommand('mrBuddy.approveMr', (item?: MrItem) => approveMr(item)),
    vscode.commands.registerCommand('mrBuddy.copyText', (text?: string) => {
      if (!text) return;
      vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage('Copied to clipboard.');
    }),
    vscode.commands.registerCommand('mrBuddy.markViewed', (item?: MrItem) => toggleViewed(item, true)),
    vscode.commands.registerCommand('mrBuddy.unmarkViewed', (item?: MrItem) => toggleViewed(item, false)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mrBuddy')) {
        initClient(context).then(() => refreshAll());
        scheduleAutoRefresh();
      }
    })
  );

  await initClient(context);
  scheduleAutoRefresh();
  await refreshAll();
}

export function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
}

async function initClient(context: vscode.ExtensionContext) {
  const host = vscode.workspace.getConfiguration('mrBuddy').get<string>('gitlabHost') || 'https://gitlab.com';
  const token = await context.secrets.get(SECRET_KEY);
  if (!token) {
    client = undefined;
    currentUser = undefined;
    return;
  }
  client = new GitLabClient(host, token);
  try {
    currentUser = await client.currentUser();
  } catch (e: any) {
    vscode.window.showErrorMessage(`MR Buddy: failed to authenticate — ${e.message}`);
    client = undefined;
    currentUser = undefined;
  }
}

async function signIn(context: vscode.ExtensionContext) {
  const host = await vscode.window.showInputBox({
    prompt: 'GitLab host URL',
    value: vscode.workspace.getConfiguration('mrBuddy').get<string>('gitlabHost') || 'https://gitlab.com',
    ignoreFocusOut: true
  });
  if (!host) return;
  await vscode.workspace.getConfiguration('mrBuddy').update('gitlabHost', host, vscode.ConfigurationTarget.Global);

  const token = await vscode.window.showInputBox({
    prompt: 'GitLab Personal Access Token (scopes: api, read_user)',
    password: true,
    ignoreFocusOut: true,
    placeHolder: 'glpat-…'
  });
  if (!token) return;

  await context.secrets.store(SECRET_KEY, token);
  await initClient(context);
  if (currentUser) {
    vscode.window.showInformationMessage(`MR Buddy: signed in as @${currentUser.username}`);
    await refreshAll();
  }
}

async function signOut(context: vscode.ExtensionContext) {
  await context.secrets.delete(SECRET_KEY);
  client = undefined;
  currentUser = undefined;
  for (const p of Object.values(providers)) p.setItems([]);
  vscode.window.showInformationMessage('MR Buddy: signed out.');
}

function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  const minutes = vscode.workspace.getConfiguration('mrBuddy').get<number>('refreshIntervalMinutes') ?? 5;
  if (minutes > 0) {
    refreshTimer = setInterval(() => refreshAll(), minutes * 60 * 1000);
  }
}

function toggleViewed(item: MrItem | undefined, markAsViewed: boolean) {
  if (!item?.mr) return;
  const key = viewedKey(item.mr);
  if (markAsViewed) {
    viewedStore.set(key, item.mr.updated_at);
  } else {
    viewedStore.delete(key);
  }
  saveViewedStore();
  refreshAll();
}

type MrData = {
  mr: MergeRequest;
  approvedByMe: boolean;
  approvedByUsers: GitLabUser[];
  highlight?: boolean;
  commentedByUserIds?: Set<number>;
};

function splitByViewed(
  dataList: MrData[],
  storeChanged: { changed: boolean }
): { main: MrItem[]; viewed: MrItem[] } {
  const main: MrItem[] = [];
  const viewed: MrItem[] = [];
  for (const { mr, approvedByMe, approvedByUsers, highlight, commentedByUserIds } of dataList) {
    const commented = commentedByUserIds ?? new Set<number>();
    const key = viewedKey(mr);
    const storedAt = viewedStore.get(key);
    if (storedAt !== undefined) {
      if (mr.updated_at === storedAt) {
        viewed.push(new MrItem(mr, approvedByMe, approvedByUsers, highlight ?? false, true, commented));
      } else {
        viewedStore.delete(key);
        storeChanged.changed = true;
        main.push(new MrItem(mr, approvedByMe, approvedByUsers, highlight ?? false, false, commented));
      }
    } else {
      main.push(new MrItem(mr, approvedByMe, approvedByUsers, highlight ?? false, false, commented));
    }
  }
  const byUpdatedDesc = (a: MrItem, b: MrItem) =>
    new Date(b.mr.updated_at).getTime() - new Date(a.mr.updated_at).getTime();
  main.sort(byUpdatedDesc);
  viewed.sort(byUpdatedDesc);

  return { main, viewed };
}

async function refreshAll() {
  if (!client || !currentUser) {
    for (const p of Object.values(providers)) {
      p.setError('Not signed in. Run "MR Buddy: Sign In to GitLab".');
    }
    return;
  }
  const activeClient = client;
  const activeUser = currentUser;

  // Spinner on every view's title bar for the whole duration, instead of an
  // easy-to-miss status bar message — and it stays until doRefresh actually finishes.
  const refreshPromise = doRefresh(activeClient, activeUser);
  await Promise.all(
    (Object.keys(providers) as BucketId[]).map((bucket) =>
      vscode.window.withProgress({ location: { viewId: `mrBuddy.${bucket}` } }, () => refreshPromise)
    )
  );
}

async function doRefresh(client: GitLabClient, currentUser: GitLabUser) {
  for (const p of Object.values(providers)) p.setLoading();

  const showDrafts = vscode.workspace.getConfiguration('mrBuddy').get<boolean>('showDrafts') ?? true;
  const filter = (mrs: MergeRequest[]) =>
    showDrafts ? mrs : mrs.filter((m) => !(m.draft || m.work_in_progress));

  try {
    const [reviewing, authored, assigned] = await Promise.all([
      client.mergeRequests({ reviewer_username: currentUser.username }),
      client.mergeRequests({ author_username: currentUser.username }),
      client.mergeRequests({ assignee_username: currentUser.username })
    ]);

    const reviewingFiltered = filter(reviewing);
    const authoredFiltered = filter(authored);

    const [reviewingData, authoredData, assignedData] = await Promise.all([
      Promise.all(
        reviewingFiltered.map(async (mr): Promise<MrData & { needsMyApprovalHighlight: boolean }> => {
          try {
            const [state, discs] = await Promise.all([
              client!.approvalState(mr.project_id, mr.iid),
              client!.discussions(mr.project_id, mr.iid)
            ]);
            const approvedByUsers = state.approved_by.map((a) => a.user);
            const approvedByMe = approvedByUsers.some((u) => u.id === currentUser!.id);
            const commentedByUserIds = new Set(
              discs.flatMap((d) => d.notes.filter((n) => !n.system).map((n) => n.author.id))
            );
            const myThreads = discs.filter((d) => {
              const first = d.notes.find((n) => !n.system);
              return first?.author.id === currentUser!.id;
            });
            const needsMyApprovalHighlight =
              myThreads.length > 0 &&
              myThreads.every((thread) =>
                thread.notes.filter((n) => !n.system).slice(1).some((n) => n.author.id !== currentUser!.id)
              );
            return { mr, approvedByMe, approvedByUsers, commentedByUserIds, needsMyApprovalHighlight };
          } catch {
            return { mr, approvedByMe: false, approvedByUsers: [], needsMyApprovalHighlight: false };
          }
        })
      ),
      Promise.all(
        authoredFiltered.map(async (mr): Promise<MrData> => {
          try {
            const [state, discs] = await Promise.all([
              client!.approvalState(mr.project_id, mr.iid),
              client!.discussions(mr.project_id, mr.iid)
            ]);
            const approvedByUsers = state.approved_by.map((a) => a.user);
            const approvedIds = new Set(approvedByUsers.map((u) => u.id));
            const commentedByUserIds = new Set(
              discs.flatMap((d) => d.notes.filter((n) => !n.system).map((n) => n.author.id))
            );
            const highlight =
              mr.reviewers.length > 0 &&
              mr.reviewers.every((r) => approvedIds.has(r.id) || commentedByUserIds.has(r.id));
            return { mr, approvedByMe: false, approvedByUsers, commentedByUserIds, highlight };
          } catch {
            return { mr, approvedByMe: false, approvedByUsers: [] };
          }
        })
      ),
      Promise.all(
        filter(assigned).map(async (mr): Promise<MrData> => {
          try {
            const [state, discs] = await Promise.all([
              client!.approvalState(mr.project_id, mr.iid),
              client!.discussions(mr.project_id, mr.iid)
            ]);
            const approvedByUsers = state.approved_by.map((a) => a.user);
            const approvedByMe = approvedByUsers.some((u) => u.id === currentUser!.id);
            const commentedByUserIds = new Set(
              discs.flatMap((d) => d.notes.filter((n) => !n.system).map((n) => n.author.id))
            );
            return { mr, approvedByMe, approvedByUsers, commentedByUserIds };
          } catch {
            return { mr, approvedByMe: false, approvedByUsers: [] };
          }
        })
      )
    ]);

    const storeChanged = { changed: false };

    const needsApprovalData = reviewingData
      .filter(({ approvedByMe }) => !approvedByMe)
      .map(({ mr, approvedByUsers, commentedByUserIds, needsMyApprovalHighlight }) => ({
        mr, approvedByMe: false, approvedByUsers, commentedByUserIds, highlight: needsMyApprovalHighlight
      }));
    const needsApprovalIds = new Set(needsApprovalData.map(({ mr }) => `${mr.project_id}:${mr.iid}`));
    const reviewingOnlyData = reviewingData.filter(({ mr }) => !needsApprovalIds.has(`${mr.project_id}:${mr.iid}`));

    const reviewing_ = splitByViewed(reviewingOnlyData, storeChanged);
    const needsApproval_ = splitByViewed(needsApprovalData, storeChanged);
    const authored_ = splitByViewed(authoredData, storeChanged);
    const assigned_ = splitByViewed(assignedData, storeChanged);

    if (storeChanged.changed) saveViewedStore();

    providers.reviewing.setItems(reviewing_.main, reviewing_.viewed);
    providers.needsMyApproval.setItems(needsApproval_.main, needsApproval_.viewed);
    providers.authored.setItems(authored_.main, authored_.viewed);
    providers.assigned.setItems(assigned_.main, assigned_.viewed);
    updateViewHeaders();
  } catch (e: any) {
    for (const p of Object.values(providers)) p.setError(e.message);
    vscode.window.showErrorMessage(`MR Buddy: refresh failed — ${e.message}`);
  }
}

async function approveMr(item?: MrItem) {
  if (!item?.mr || !client) return;
  const confirm = await vscode.window.showWarningMessage(
    `Approve "${item.mr.title}"?`,
    { modal: true },
    'Approve'
  );
  if (confirm !== 'Approve') return;
  try {
    await client.approve(item.mr.project_id, item.mr.iid);
    vscode.window.showInformationMessage(`Approved ${item.mr.references.full}.`);
    await refreshAll();
  } catch (e: any) {
    vscode.window.showErrorMessage(`Approve failed: ${e.message}`);
  }
}
