import * as vscode from 'vscode';
import { GitLabClient, MergeRequest, GitLabUser } from './gitlab';
import { MrTreeProvider, MrItem, BucketId } from './treeProvider';

const SECRET_KEY = 'mrBuddy.gitlabToken';

let client: GitLabClient | undefined;
let currentUser: GitLabUser | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

const providers: Record<BucketId, MrTreeProvider> = {
  reviewing: new MrTreeProvider('reviewing', 'No MRs awaiting your review.'),
  needsMyApproval: new MrTreeProvider('needsMyApproval', '🎉 All clear — nothing needs your approval.'),
  authored: new MrTreeProvider('authored', 'No open MRs authored by you.'),
  assigned: new MrTreeProvider('assigned', 'No MRs assigned to you.')
};

export async function activate(context: vscode.ExtensionContext) {
  vscode.window.registerTreeDataProvider('mrBuddy.reviewing', providers.reviewing);
  vscode.window.registerTreeDataProvider('mrBuddy.needsMyApproval', providers.needsMyApproval);
  vscode.window.registerTreeDataProvider('mrBuddy.authored', providers.authored);
  vscode.window.registerTreeDataProvider('mrBuddy.assigned', providers.assigned);

  context.subscriptions.push(
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

async function refreshAll() {
  if (!client || !currentUser) {
    for (const p of Object.values(providers)) {
      p.setError('Not signed in. Run "MR Buddy: Sign In to GitLab".');
    }
    return;
  }

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

    // Fetch approval state + discussions for reviewing and authored MRs in parallel
    const [approvalResults, authoredItems] = await Promise.all([
      Promise.all(
        reviewingFiltered.map(async (mr) => {
          try {
            const [state, discs] = await Promise.all([
              client!.approvalState(mr.project_id, mr.iid),
              client!.discussions(mr.project_id, mr.iid)
            ]);
            const approvedByUsers = state.approved_by.map((a) => a.user);
            const approvedByMe = approvedByUsers.some((u) => u.id === currentUser!.id);
            // Bold in "needs my approval" when every thread I started has a reply
            const myThreads = discs.filter((d) => {
              const first = d.notes.find((n) => !n.system);
              return first?.author.id === currentUser!.id;
            });
            const needsMyApprovalHighlight =
              myThreads.length > 0 &&
              myThreads.every((thread) =>
                thread.notes.filter((n) => !n.system).slice(1).some((n) => n.author.id !== currentUser!.id)
              );
            return { mr, approvedByMe, approvedByUsers, needsMyApprovalHighlight };
          } catch {
            return { mr, approvedByMe: false, approvedByUsers: [], needsMyApprovalHighlight: false };
          }
        })
      ),
      Promise.all(
        authoredFiltered.map(async (mr) => {
          try {
            const [state, discs] = await Promise.all([
              client!.approvalState(mr.project_id, mr.iid),
              client!.discussions(mr.project_id, mr.iid)
            ]);
            const approvedIds = new Set(state.approved_by.map((a) => a.user.id));
            const commenterIds = new Set(
              discs.flatMap((d) => d.notes.filter((n) => !n.system).map((n) => n.author.id))
            );
            // Bold in "authored" when every reviewer has approved or left a comment
            const highlight =
              mr.reviewers.length > 0 &&
              mr.reviewers.every((r) => approvedIds.has(r.id) || commenterIds.has(r.id));
            return new MrItem(mr, false, [], highlight);
          } catch {
            return new MrItem(mr, false);
          }
        })
      )
    ]);

    providers.reviewing.setItems(
      approvalResults.map(({ mr, approvedByMe, approvedByUsers }) => new MrItem(mr, approvedByMe, approvedByUsers))
    );
    providers.needsMyApproval.setItems(
      approvalResults
        .filter(({ approvedByMe }) => !approvedByMe)
        .map(({ mr, approvedByUsers, needsMyApprovalHighlight }) => new MrItem(mr, false, approvedByUsers, needsMyApprovalHighlight))
    );
    providers.authored.setItems(authoredItems);
    providers.assigned.setItems(filter(assigned).map((mr) => new MrItem(mr, false)));
  } catch (e: any) {
    for (const p of Object.values(providers)) p.setError(e.message);
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
