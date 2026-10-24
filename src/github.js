/**
 * src/github.js —— GitHub 公开数据抓取（无需登录，仅使用公开 API）
 *
 * 未带 Token 时限速 60 次/小时/IP；带 GITHUB_TOKEN 时可到 5000 次/小时。
 * 只读取公开信息：用户资料、公开事件流、公开仓库。
 */

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, { status, resetAt } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.resetAt = resetAt;
  }
}

async function ghFetch(path, token) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'codemac' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 404) throw new GitHubError(`GitHub 用户不存在：${path}`, { status: 404 });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const resetAt = reset ? new Date(Number(reset) * 1000) : null;
    throw new GitHubError(
      `GitHub API 触发限流${resetAt ? `，请在 ${resetAt.toLocaleTimeString('zh-CN')} 后重试，或设置 GITHUB_TOKEN` : '，请稍后重试或设置 GITHUB_TOKEN'}`,
      { status: res.status, resetAt },
    );
  }
  if (!res.ok) throw new GitHubError(`GitHub API 错误：HTTP ${res.status}`, { status: res.status });
  return res.json();
}

/**
 * 汇总一个 GitHub 用户的公开数据
 * @param {string} login  GitHub 用户名
 * @param {object} [opts]
 * @param {string} [opts.token] 可选 GitHub Token（提高限流额度）
 * @param {number} [opts.eventPages] 事件流拉取页数（每页 100 条，默认 3 页 ≈ 300 条）
 * @returns {Promise<object>} 归一化后的指标
 */
export async function collectGitHubData(login, { token, eventPages = 3 } = {}) {
  const profile = await ghFetch(`/users/${encodeURIComponent(login)}`, token);

  // 公开事件流（最近 300 条左右，覆盖约 90 天）
  const events = [];
  for (let page = 1; page <= eventPages; page++) {
    const batch = await ghFetch(
      `/users/${encodeURIComponent(login)}/events/public?per_page=100&page=${page}`,
      token,
    );
    events.push(...batch);
    if (batch.length < 100) break;
  }

  // 公开仓库（按最近推送排序，拉 1 页 100 个足够统计）
  const repos = await ghFetch(
    `/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed`,
    token,
  );

  return normalize({ profile, events, repos });
}

/** 把原始 API 数据归一化为报告指标 */
export function normalize({ profile, events, repos }) {
  const metrics = {
    commits: 0,
    prsOpened: 0,
    prsMerged: 0,
    issuesOpened: 0,
    reviews: 0,
    comments: 0,
    reposCreated: 0,
    reposStarred: 0,
    releases: 0,
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'PushEvent':
        metrics.commits += ev.payload?.size ?? ev.payload?.commits?.length ?? 1;
        break;
      case 'PullRequestEvent':
        if (ev.payload?.action === 'opened') metrics.prsOpened += 1;
        if (ev.payload?.action === 'closed' && ev.payload?.pull_request?.merged) metrics.prsMerged += 1;
        break;
      case 'IssuesEvent':
        if (ev.payload?.action === 'opened') metrics.issuesOpened += 1;
        break;
      case 'PullRequestReviewEvent':
        metrics.reviews += 1;
        break;
      case 'IssueCommentEvent':
      case 'PullRequestReviewCommentEvent':
      case 'CommitCommentEvent':
        metrics.comments += 1;
        break;
      case 'CreateEvent':
        if (ev.payload?.ref_type === 'repository') metrics.reposCreated += 1;
        break;
      case 'WatchEvent':
        metrics.reposStarred += 1;
        break;
      case 'ReleaseEvent':
        metrics.releases += 1;
        break;
      default:
        break;
    }
  }

  const ownedRepos = repos.filter((r) => !r.fork);
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count ?? 0), 0);
  const topRepo = [...repos].sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))[0] ?? null;

  const languageCount = {};
  for (const r of repos) {
    if (r.language) languageCount[r.language] = (languageCount[r.language] ?? 0) + 1;
  }
  const topLanguage =
    Object.entries(languageCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '未知';

  const accountYears = profile.created_at
    ? (Date.now() - new Date(profile.created_at).getTime()) / (365.25 * 24 * 3600 * 1000)
    : 0;

  return {
    login: profile.login,
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
    bio: profile.bio ?? '',
    company: profile.company ?? '',
    location: profile.location ?? '',
    followers: profile.followers ?? 0,
    following: profile.following ?? 0,
    publicRepos: profile.public_repos ?? 0,
    accountYears: Math.max(accountYears, 0),
    totalStars,
    totalForks,
    topRepo: topRepo ? { name: topRepo.name, stars: topRepo.stargazers_count ?? 0 } : null,
    topLanguage,
    ...metrics,
    eventCount: events.length,
  };
}
