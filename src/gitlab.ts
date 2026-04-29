import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  draft: boolean;
  work_in_progress: boolean;
  web_url: string;
  author: GitLabUser;
  assignees: GitLabUser[];
  reviewers: GitLabUser[];
  created_at: string;
  updated_at: string;
  source_branch: string;
  target_branch: string;
  references: { full: string };
  user_notes_count: number;
  upvotes: number;
  downvotes: number;
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  detailed_merge_status?: string;
  head_pipeline?: { status: string } | null;
}

export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  avatar_url: string;
}

export interface ApprovalState {
  approved: boolean;
  approved_by: { user: GitLabUser }[];
  approvals_required?: number;
  approvals_left?: number;
}

export interface Note {
  id: number;
  author: GitLabUser;
  body: string;
  system: boolean;
}

export interface Discussion {
  id: string;
  notes: Note[];
}

export class GitLabClient {
  constructor(private host: string, private token: string) {}

  private request<T>(path: string, method: string = 'GET'): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.host);
      const mod = url.protocol === 'http:' ? http : https;
      const req = mod.request(
        {
          method,
          hostname: url.hostname,
          port: url.port || undefined,
          path: url.pathname + url.search,
          headers: {
            'PRIVATE-TOKEN': this.token,
            'Accept': 'application/json',
            'User-Agent': 'mr-buddy-vscode'
          }
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
              reject(new Error(`GitLab ${method} ${path} failed: ${res.statusCode} ${data.slice(0, 200)}`));
              return;
            }
            try {
              resolve(data ? JSON.parse(data) : ({} as T));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  async currentUser(): Promise<GitLabUser> {
    return this.request<GitLabUser>('/api/v4/user');
  }

  async mergeRequests(params: Record<string, string>): Promise<MergeRequest[]> {
    const qs = new URLSearchParams({ state: 'opened', scope: 'all', per_page: '100', ...params });
    return this.request<MergeRequest[]>(`/api/v4/merge_requests?${qs.toString()}`);
  }

  async approvalState(projectId: number, iid: number): Promise<ApprovalState> {
    return this.request<ApprovalState>(`/api/v4/projects/${projectId}/merge_requests/${iid}/approvals`);
  }

  async approve(projectId: number, iid: number): Promise<void> {
    await this.request(`/api/v4/projects/${projectId}/merge_requests/${iid}/approve`, 'POST');
  }

  async discussions(projectId: number, iid: number): Promise<Discussion[]> {
    return this.request<Discussion[]>(
      `/api/v4/projects/${projectId}/merge_requests/${iid}/discussions?per_page=100`
    );
  }
}
