# Changelog

All notable changes to MR Buddy are documented here.

## [0.8.0] — 2026-07-15

- Add CHANGELOG.md

## [0.7.0] — 2026-07-15

- Fix reviewer comment indicator: 💬 now shown only for reviewers who actually commented on the MR, not every unapproved reviewer
- Detect ticket number from MR description (`Closes #N`, `Fixes #N`, `Resolves #N`) when no `#N` appears in the title
- Add **Copy MR link** button to the tooltip
- Group all copy buttons on one line: Copy branch name · Copy ticket link · Copy MR link
- Put opened/updated dates on their own line in the tooltip
- Reviewers now display inline (`✅ @alice  •  ⏳ @bob`) instead of one per line

## [0.6.0] — 2026-06-25

- Ticket numbers (`#1234`) in MR titles are now clickable links to the corresponding GitLab issue
- Add **Copy ticket link** button to the tooltip
- Add **Copy branch name** button to the tooltip

## [0.5.0] — 2026-06-23

- Show **last updated** date (latest of commits, comments, approvals, label changes) in the MR row description
- Sort all sections by `updated_at` descending so recently active MRs appear first

## [0.4.0]

- Fix flicker when marking MRs as viewed: stable `id` on tree items lets VS Code diff updates in place

## [0.3.0]

- **Non-blocking refresh**: existing content stays visible while a background refresh runs
- Per-section progress spinners in each panel title bar instead of a status bar message

## [0.2.0] — 2026-06-17

- Published to the VS Code Marketplace
- Add extension icon, publisher metadata, keywords, repository links
- Add `.vscodeignore` to keep the packaged `.vsix` small

## [0.1.0]

- Initial release
- **Reviewing** — all open MRs where you are a reviewer, with `[approved/total]` count
- **Needs My Approval** — reviewer MRs you haven't approved yet (deduped from Reviewing)
- **Authored by Me** — your open MRs, highlighted when all reviewers have approved or commented
- **Assigned to Me** — MRs assigned to you
- Mark MR as **Viewed**: moves to a collapsible "Viewed (N)" sub-section; auto-unviews if the MR is updated
- Hover tooltip: per-reviewer approval status, pipeline status, branch info, conflict warning
- Inline **Approve** action and **Open in browser** from the tree row
- Configurable auto-refresh interval; supports self-hosted GitLab
