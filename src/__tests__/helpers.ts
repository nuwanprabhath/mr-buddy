import { MergeRequest, GitLabUser } from '../gitlab';

export function makeUser(overrides: Partial<GitLabUser> = {}): GitLabUser {
  return { id: 1, username: 'alice', name: 'Alice', avatar_url: '', ...overrides };
}

export function makeMr(overrides: Partial<MergeRequest> = {}): MergeRequest {
  return {
    id: 100,
    iid: 42,
    project_id: 1,
    title: 'Fix the thing',
    description: '',
    state: 'opened',
    draft: false,
    work_in_progress: false,
    web_url: 'https://gitlab.example.com/org/repo/-/merge_requests/42',
    author: makeUser({ id: 1, username: 'alice' }),
    assignees: [],
    reviewers: [],
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    updated_at: new Date().toISOString(),
    source_branch: 'feature-branch',
    target_branch: 'main',
    references: { full: 'org/repo!42' },
    user_notes_count: 0,
    upvotes: 0,
    downvotes: 0,
    has_conflicts: false,
    blocking_discussions_resolved: true,
    head_pipeline: null,
    ...overrides
  };
}
