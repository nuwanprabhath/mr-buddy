# MR Buddy

VS Code extension that fills the gap in GitLab's web UI: filter merge requests you're a reviewer on by **whether you've approved them yet**.

## Features

- **Reviewing** — all open MRs where you're a reviewer, with `[approved/total]` count
- **Needs My Approval** — reviewer MRs you haven't approved yet (the filter GitLab's web UI lacks)
- **Authored by Me** — your open MRs
- **Assigned to Me** — MRs assigned to you
- **Search / filter** across all sections at once — by author, title, MR number, project or branch
- Hover tooltip shows per-reviewer approval status
- Inline **Approve** action, **Open in browser**, **Copy URL**
- Auto-refresh on a configurable interval
- Works with self-hosted GitLab (set `mrBuddy.gitlabHost`)

## Install

Search for **MR Buddy** in the VS Code Extensions view, or install from the [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=nuwan.mr-buddy).

The MR Buddy icon will appear in the activity bar after install.

### Build from source

```bash
git clone https://github.com/nuwanprabhath/mr-buddy.git
cd mr-buddy
npm install
npm run install-local
```

`install-local` deletes any stale `.vsix`, builds a fresh one, and installs it.

Alternatively, install via the UI: `Cmd+Shift+P` → **Extensions: Install from VSIX…** → select the generated `.vsix`.

### Sign in

1. `Cmd+Shift+P` → **MR Buddy: Sign In to GitLab**
2. Enter your GitLab host (default: `https://gitlab.com`)
3. Paste a Personal Access Token with scopes **`api`** and **`read_user`**
   — create one at `https://gitlab.com/-/user_settings/personal_access_tokens`

### Updating after code changes

```bash
npm install
npm run install-local
```

Then reload the window: `Cmd+Shift+P` → **Developer: Reload Window**.

## Searching

Click the 🔍 icon in any section's title bar (or press `Cmd+Alt+F` / `Ctrl+Alt+F` while an MR Buddy view is focused). The list filters live as you type, across **all four sections** at once.

| Query | Matches |
|---|---|
| `tokmakoff` | anything mentioning tokmakoff — author, title, branch… |
| `@tokmakoff` | MRs **authored by** tokmakoff only |
| `!1131` | MR number 1131 |
| `@jinadl fix` | Jin's MRs whose title/branch mentions "fix" |

Section headers show `3 of 12 — <query>` while a filter is active. Clear it with the ✖ button in the title bar.

## How "Needs My Approval" works

The GitLab REST API has no `approved_by_me=false` filter, but `/projects/:id/merge_requests/:iid/approvals` returns who has approved each MR. MR Buddy fetches that per reviewer-MR and filters client-side — no scraping needed.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `mrBuddy.gitlabHost` | `https://gitlab.com` | Your GitLab instance URL |
| `mrBuddy.refreshIntervalMinutes` | `5` | `0` disables auto-refresh |
| `mrBuddy.showDrafts` | `true` | Include draft MRs |
