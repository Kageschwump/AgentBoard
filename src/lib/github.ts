/**
 * Minimal GitHub REST client for approving/rejecting agent PRs from the board.
 * The hosted server has no git checkout, so it needs GITHUB_TOKEN (a token
 * with pull request + contents write access on the board's repos) to merge.
 * Without it, approving just marks the task done and you merge on GitHub.
 */

interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export function parseGitHubPrUrl(url: string): PrRef | null {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export function canMergeOnGitHub(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

async function github(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub API returned ${res.status}`);
  }
  return res;
}

async function deleteBranch(pr: PrRef, branchName: string) {
  if (!branchName) return;
  try {
    await github(
      `/repos/${pr.owner}/${pr.repo}/git/refs/heads/${encodeURIComponent(branchName).replace(/%2F/g, "/")}`,
      { method: "DELETE" }
    );
  } catch {
    // Branch may already be gone
  }
}

/** Merge the PR. Returns false when this server can't merge it (no token / not GitHub). */
export async function mergeGitHubPr(prUrl: string, branchName: string): Promise<boolean> {
  const pr = parseGitHubPrUrl(prUrl);
  if (!pr || !canMergeOnGitHub()) return false;
  await github(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: "merge" }),
  });
  await deleteBranch(pr, branchName);
  return true;
}

/** Close the PR without merging (best-effort). */
export async function closeGitHubPr(prUrl: string, branchName: string): Promise<void> {
  const pr = parseGitHubPrUrl(prUrl);
  if (!pr || !canMergeOnGitHub()) return;
  await github(`/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
  await deleteBranch(pr, branchName);
}
