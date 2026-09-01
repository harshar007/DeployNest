import { Octokit } from "@octokit/rest";

export interface GitHubRepoItem {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  cloneUrl: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  description: string | null;
  language: string | null;
  updatedAt: string | null;
}

export interface GitHubUserProfile {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string;
  email: string | null;
}

export function createOctokitClient(token: string) {
  return new Octokit({ auth: token });
}

export async function validateGitHubToken(token: string): Promise<GitHubUserProfile> {
  const octokit = createOctokitClient(token);
  const { data } = await octokit.rest.users.getAuthenticated();
  return {
    id: String(data.id),
    username: data.login,
    name: data.name || data.login,
    avatarUrl: data.avatar_url,
    email: data.email || null,
  };
}

export async function fetchUserRepositories(token: string): Promise<GitHubRepoItem[]> {
  const octokit = createOctokitClient(token);
  const repos = await octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
    affiliation: "owner,collaborator,organization_member",
  });

  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    cloneUrl: r.clone_url,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    isPrivate: r.private,
    description: r.description || null,
    language: r.language || null,
    updatedAt: r.updated_at || null,
  }));
}

export async function fetchRepoBranches(token: string, owner: string, repo: string): Promise<string[]> {
  const octokit = createOctokitClient(token);
  try {
    const { data } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 50,
    });
    return data.map((b) => b.name);
  } catch (err) {
    console.error(`Failed to list branches for ${owner}/${repo}:`, err);
    return ["main", "master"];
  }
}

export async function fetchLatestCommit(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ sha: string; message: string; author: string } | null> {
  const octokit = createOctokitClient(token);
  try {
    const { data } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref: branch,
    });
    return {
      sha: data.sha.substring(0, 7),
      message: data.commit.message.split("\n")[0],
      author: data.commit.author?.name || data.author?.login || "Unknown",
    };
  } catch (err) {
    console.error(`Failed to get latest commit for ${owner}/${repo}@${branch}:`, err);
    return null;
  }
}

export async function setupGitHubWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<string | null> {
  const octokit = createOctokitClient(token);
  try {
    // Check existing hooks
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });

    const existingHook = hooks.find((h) => h.config.url === webhookUrl);
    if (existingHook) {
      return String(existingHook.id);
    }

    const { data: created } = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      name: "web",
      active: true,
      events: ["push"],
      config: {
        url: webhookUrl,
        content_type: "json",
        secret,
        insecure_ssl: "0",
      },
    });

    return String(created.id);
  } catch (err) {
    console.error(`Failed to configure GitHub webhook for ${owner}/${repo}:`, err);
    return null;
  }
}

export async function deleteGitHubWebhook(
  token: string,
  owner: string,
  repo: string,
  hookId: string
): Promise<boolean> {
  const octokit = createOctokitClient(token);
  try {
    await octokit.rest.repos.deleteWebhook({
      owner,
      repo,
      hook_id: parseInt(hookId, 10),
    });
    return true;
  } catch (err) {
    console.error(`Failed to delete webhook for ${owner}/${repo}:`, err);
    return false;
  }
}
