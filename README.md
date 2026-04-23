# MR Buddy

VS Code extension that fills the gap in GitLab's web UI: filter merge requests you're a reviewer on by **whether you've approved them yet**.

## Features

- **Reviewing** — all open MRs where you're a reviewer, with `[approved/total]` count
- **Needs My Approval** — reviewer MRs you haven't approved yet (the filter GitLab's web UI lacks)
- **Authored by Me** — your open MRs
- **Assigned to Me** — MRs assigned to you
- Hover tooltip shows per-reviewer approval status
- Inline **Approve** action, **Open in browser**, **Copy URL**
- Auto-refresh on a configurable interval
- Works with self-hosted GitLab (set `mrBuddy.gitlabHost`)

## Install

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [VS Code](https://code.visualstudio.com)

### Build and install

```bash
git clone <repo-url>
cd mr-buddy
npm install
npx @vscode/vsce package
code --install-extension mr-buddy-0.1.0.vsix
```

Restart VS Code after install. The MR Buddy icon will appear in the activity bar.

Alternatively, install via the UI: `Cmd+Shift+P` → **Extensions: Install from VSIX…** → select `mr-buddy-0.1.0.vsix`.

### Sign in

1. `Cmd+Shift+P` → **MR Buddy: Sign In to GitLab**
2. Enter your GitLab host (default: `https://gitlab.com`)
3. Paste a Personal Access Token with scopes **`api`** and **`read_user`**
   — create one at `https://gitlab.com/-/user_settings/personal_access_tokens`

### Updating after code changes

```bash
npm install
npx @vscode/vsce package
code --install-extension mr-buddy-0.1.0.vsix
```

Then restart VS Code (or reload the window: `Cmd+Shift+P` → **Developer: Reload Window**).

## How "Needs My Approval" works

The GitLab REST API has no `approved_by_me=false` filter, but `/projects/:id/merge_requests/:iid/approvals` returns who has approved each MR. MR Buddy fetches that per reviewer-MR and filters client-side — no scraping needed.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `mrBuddy.gitlabHost` | `https://gitlab.com` | Your GitLab instance URL |
| `mrBuddy.refreshIntervalMinutes` | `5` | `0` disables auto-refresh |
| `mrBuddy.showDrafts` | `true` | Include draft MRs |
