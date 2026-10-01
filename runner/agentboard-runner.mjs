#!/usr/bin/env node
/**
 * AgentBoard runner: connects Claude Code on your machine to a shared AgentBoard.
 *
 * It asks the board for ready tasks, runs `claude` locally with your own login,
 * streams the output back to the board, and for boards with a git repo it
 * pushes a branch and opens a PR using your own git / gh credentials.
 *
 *   node agentboard-runner.mjs --server https://your-board.example.com --token abr_...
 *
 * Needs Node 18+, Claude Code (`claude`) logged in, git, and gh for GitHub PRs.
 * No npm install required.
 */
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VERSION = "1.3.1";
const POLL_INTERVAL_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const LOG_FLUSH_INTERVAL_MS = 1_000;
const MAX_PENDING_LOGS = 5_000;
const MAX_DIFF_CHARS = 1_000_000;
const SUMMARY_TIMEOUT_MS = 120_000;
// Claude Code doesn't exit after its final result while a Monitor the agent started is running
const RESULT_EXIT_GRACE_MS = 30_000;
const IS_WINDOWS = process.platform === "win32";
const DEFAULT_DIR = path.join(os.homedir(), ".agentboard-runner");

const HELP = `AgentBoard runner ${VERSION}

Usage:
  node agentboard-runner.mjs --server <url> --token <token> [options]

Options:
  --server <url>             Board URL (or AGENTBOARD_SERVER)
  --token <token>            Runner token from the board's Agents panel (or AGENTBOARD_TOKEN)
  --concurrency <n>          Tasks to run at once (default 1)
  --board <id>               Only take tasks from this board (repeatable)
  --workdir <dir>            Where repos and task folders live (default ~/.agentboard-runner)
  --claude <path>            Claude Code executable (default "claude")
  --permission-mode <mode>   Claude permission mode (default bypassPermissions;
                             acceptEdits blocks commands that would need approval)
  --max-turns <n>            Max agent turns per task when the board doesn't set one (default 50)
  --stop-at <percent>        Stop the agent and save its work once a Claude usage limit
                             (session or weekly) is this % used (default 95; 100 = only
                             when the limit is actually hit)
  --no-summary               Skip the post-task summary (saves a small Haiku call)
  --config <file>            Settings file (default ~/.agentboard-runner/config.json)
  -v, --verbose              Print all agent output, not just progress
  -h, --help                 Show this help

Settings are saved to the config file after the first successful
connection, so next time you can just run: node agentboard-runner.mjs`;

// ── Config ─────────────────────────────────────────────────────────

let flags;
try {
  ({ values: flags } = parseArgs({
    options: {
      server: { type: "string" },
      token: { type: "string" },
      concurrency: { type: "string" },
      board: { type: "string", multiple: true },
      workdir: { type: "string" },
      claude: { type: "string" },
      "permission-mode": { type: "string" },
      "max-turns": { type: "string" },
      "stop-at": { type: "string" },
      "no-summary": { type: "boolean" },
      config: { type: "string" },
      verbose: { type: "boolean", short: "v" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  console.error(`${err.message}\n\n${HELP}`);
  process.exit(1);
}

const CONFIG_FILE = path.resolve(flags.config ?? path.join(DEFAULT_DIR, "config.json"));

function readSavedConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

const saved = readSavedConfig();
const config = {
  server: (flags.server ?? process.env.AGENTBOARD_SERVER ?? saved.server ?? "").replace(/\/+$/, ""),
  token: flags.token ?? process.env.AGENTBOARD_TOKEN ?? saved.token ?? "",
  concurrency: Math.max(1, parseInt(flags.concurrency ?? saved.concurrency ?? "1", 10) || 1),
  boards: flags.board ?? saved.boards ?? [],
  workdir: path.resolve(flags.workdir ?? saved.workdir ?? DEFAULT_DIR),
  claude: flags.claude ?? saved.claude ?? "claude",
  permissionMode: flags["permission-mode"] ?? saved.permissionMode ?? "bypassPermissions",
  maxTurns: Math.max(1, parseInt(flags["max-turns"] ?? saved.maxTurns ?? "50", 10) || 50),
  stopAt: Math.min(100, Math.max(1, parseInt(flags["stop-at"] ?? saved.stopAt ?? "95", 10) || 95)),
  summary: !(flags["no-summary"] ?? saved.noSummary ?? false),
  verbose: !!flags.verbose,
};

function saveConfig() {
  const data = {
    server: config.server,
    token: config.token,
    concurrency: String(config.concurrency),
    boards: config.boards,
    workdir: config.workdir,
    claude: config.claude,
    permissionMode: config.permissionMode,
    maxTurns: String(config.maxTurns),
    stopAt: String(config.stopAt),
    noSummary: !config.summary,
  };
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (err) {
    warn(`Could not save settings: ${err.message}`);
  }
}

// ── Output ─────────────────────────────────────────────────────────

function stamp() {
  return new Date().toLocaleTimeString([], { hour12: false });
}
function info(msg) {
  console.log(`${stamp()}  ${msg}`);
}
function warn(msg) {
  console.warn(`${stamp()}  ! ${msg}`);
}

// ── Board API ──────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(method, pathname, body) {
  let res;
  try {
    res = await fetch(config.server + pathname, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "User-Agent": `agentboard-runner/${VERSION}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    throw new ApiError(err.cause?.message || err.message, 0);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
  return data;
}

/** Retry calls whose loss would make the board redo finished work */
async function apiWithRetry(method, pathname, body, attempts = 5) {
  for (let i = 1; ; i++) {
    try {
      return await api(method, pathname, body);
    } catch (err) {
      // 4xx means the board heard us and said no; retrying won't help
      if (i >= attempts || (err.status >= 400 && err.status < 500)) throw err;
      await sleep(2_000 * i);
    }
  }
}

// ── Processes ──────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Set by a surrounding Claude Code session (if the runner was started from one).
// Config like CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CONFIG_DIR is kept.
const CLAUDE_SESSION_VARS =
  /^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT|CLAUDE_CODE_(ENTRYPOINT|SSE_PORT|EXECPATH|CHILD_SESSION|SESSION_\w+|MESSAGING_\w+))$/;

/** Environment for child processes, without markers that make Claude think it's nested */
function childEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of Object.keys(env)) {
    if (CLAUDE_SESSION_VARS.test(key)) delete env[key];
  }
  return env;
}

/** Quote an argument for cmd.exe (only used for .cmd shims like claude/az on Windows) */
function winQuote(arg) {
  if (/^[\w\-.:\\/=@]+$/.test(arg)) return arg;
  return `"${arg.replace(/["%^&|<>\r\n]/g, " ")}"`;
}

/**
 * Spawn a command. On Windows, commands like claude and az are often .cmd
 * shims that need a shell, so they go through cmd.exe with quoted args.
 */
function spawnCommand(cmd, args, { cwd, useShell = false } = {}) {
  const common = { cwd, env: childEnv(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true };
  if (IS_WINDOWS && useShell) {
    return spawn([winQuote(cmd), ...args.map(winQuote)].join(" "), { ...common, shell: true });
  }
  // Own process group on Unix so we can kill the whole agent tree
  return spawn(cmd, args, { ...common, detached: !IS_WINDOWS });
}

/** Run a command to completion; resolves stdout, rejects with stderr */
function run(cmd, args, { cwd, timeout = 120_000, input, useShell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(cmd, args, { cwd, useShell });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killTree(child);
      reject(new Error(`${cmd} ${args[0] ?? ""} timed out`));
    }, timeout);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new Error(`${cmd} is not installed or not on PATH`) : err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} ${args.slice(0, 2).join(" ")} failed: ${(stderr || stdout).trim().slice(0, 1000)}`));
    });
    child.stdin.end(input ?? "");
  });
}

function killTree(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }, 5_000).unref();
}

const git = (args, cwd, timeout) => run("git", args, { cwd, timeout });

// One git setup/teardown at a time per repo clone
const repoLocks = new Map();
function withRepoLock(key, fn) {
  const prev = repoLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  repoLocks.set(key, next.catch(() => {}));
  return next;
}

// ── Git workspace ──────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function repoDirName(url) {
  const name = slugify(url.replace(/\.git$/, "").split(/[/\\:]/).pop() || "repo");
  return `${name}-${createHash("sha1").update(url).digest("hex").slice(0, 8)}`;
}

async function firstExistingRef(repoDir, refs) {
  for (const ref of refs) {
    try {
      await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], repoDir);
      return ref;
    } catch {
      // try the next one
    }
  }
  throw new Error("Repository has no commits to branch from");
}

async function prepareWorkspace(claim, log) {
  const { task, repo } = claim;

  if (!repo) {
    const dir = path.join(config.workdir, "tasks", task.id);
    fs.mkdirSync(dir, { recursive: true });
    return { dir, repo: null };
  }

  const repoDir = path.join(config.workdir, "repos", repoDirName(repo.url));
  const dir = path.join(config.workdir, "worktrees", task.id);

  return withRepoLock(repoDir, async () => {
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      log("system", `Cloning ${repo.url}`);
      fs.mkdirSync(path.dirname(repoDir), { recursive: true });
      await git(["clone", repo.url, repoDir], config.workdir, 30 * 60_000);
    } else {
      try {
        await git(["fetch", "origin", "--prune"], repoDir, 5 * 60_000);
      } catch (err) {
        log("system", `git fetch failed, using the local copy: ${err.message}`);
      }
    }

    const baseRef = await firstExistingRef(repoDir, [
      `origin/${repo.baseBranch}`,
      repo.baseBranch,
      "HEAD",
    ]);
    const baseSha = (await git(["rev-parse", `${baseRef}^{commit}`], repoDir)).trim();

    // Continue from progress an earlier attempt pushed, if it's still there
    let branchName = `task/${slugify(task.title) || "task"}-${task.id.slice(-8)}`;
    let startPoint = baseRef;
    let resumed = false;
    if (claim.resume?.branch) {
      try {
        await git(["rev-parse", "--verify", "--quiet", `origin/${claim.resume.branch}^{commit}`], repoDir);
        branchName = claim.resume.branch;
        startPoint = `origin/${claim.resume.branch}`;
        resumed = true;
      } catch {
        log("system", `Saved progress (${claim.resume.branch}) is no longer on the remote, starting fresh`);
      }
    }

    // Clear leftovers from an earlier attempt at this task
    await git(["worktree", "prune"], repoDir).catch(() => {});
    if (fs.existsSync(dir)) {
      await git(["worktree", "remove", "--force", dir], repoDir).catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await git(["branch", "-D", branchName], repoDir).catch(() => {});

    await git(["worktree", "add", "-b", branchName, dir, startPoint], repoDir);
    // Diffs and PRs compare against the base branch, so they include earlier attempts' commits
    const baseCommit = (await git(["merge-base", "HEAD", baseSha], dir)).trim();
    log(
      "system",
      resumed
        ? `Continuing existing work on ${branchName}`
        : `Working on branch ${branchName} (from ${startPoint})`
    );

    return { dir, repo, repoDir, branchName, baseCommit, resumed, keep: false };
  });
}

function detectProvider(url) {
  return /dev\.azure\.com|visualstudio\.com/.test(url) ? "azuredevops" : "github";
}

function githubCompareUrl(repoUrl, base, branch) {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/);
  return match ? `https://github.com/${match[1]}/${match[2]}/compare/${base}...${branch}?expand=1` : "";
}

async function openPullRequest(claim, ws) {
  const { task, repo } = claim;
  const title = task.title;
  const body = `Automated PR from AgentBoard, made by ${me.name}.\n\nTask: ${task.title}`;
  const provider = repo.gitProvider || detectProvider(repo.url);

  if (provider === "azuredevops") {
    const out = await run(
      "az",
      ["repos", "pr", "create", "--title", title, "--description", body,
        "--source-branch", ws.branchName, "--target-branch", repo.baseBranch, "--output", "json"],
      { cwd: ws.dir, timeout: 60_000, useShell: true }
    );
    const pr = JSON.parse(out);
    return pr.repository?.webUrl && pr.pullRequestId
      ? `${pr.repository.webUrl}/pullrequest/${pr.pullRequestId}`
      : pr.url || "";
  }

  // A retried task force-pushes the same branch, so its PR may already exist
  try {
    const existing = (
      await run("gh", ["pr", "view", ws.branchName, "--json", "url,state", "--jq", 'select(.state == "OPEN") | .url'], {
        cwd: ws.dir,
        timeout: 30_000,
      })
    ).trim();
    if (existing) return existing;
  } catch {
    // no PR yet
  }

  const out = await run(
    "gh",
    ["pr", "create", "--title", title, "--body", body, "--base", repo.baseBranch, "--head", ws.branchName],
    { cwd: ws.dir, timeout: 60_000 }
  );
  return out.trim().split("\n").pop() || "";
}

/**
 * Commit whatever the agent changed and push the task branch.
 * Returns the diff against the base branch, or null if there's nothing to push.
 */
async function commitAndPush(ws, message, log) {
  await git(["add", "-A"], ws.dir);
  const status = (await git(["status", "--porcelain"], ws.dir)).trim();
  if (status) {
    const hasIdentity = await git(["config", "user.email"], ws.dir).then((s) => !!s.trim(), () => false);
    const identity = hasIdentity
      ? []
      : ["-c", "user.name=AgentBoard Runner", "-c", "user.email=agentboard-runner@users.noreply.github.com"];
    await git([...identity, "commit", "-m", message], ws.dir);
  }

  const ahead = parseInt((await git(["rev-list", "--count", `${ws.baseCommit}..HEAD`], ws.dir)).trim(), 10);
  if (!ahead) return null;

  ws.keep = true; // committed but not pushed yet: don't delete it if the push fails
  let diff = await git(["diff", `${ws.baseCommit}..HEAD`], ws.dir, 60_000).catch(() => "");
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + "\n\n... diff truncated ...";
  }

  log("system", `Pushing ${ws.branchName}`);
  // The branch belongs to this task; a fresh retry replaces the previous attempt
  await git(["push", "--force", "-u", "origin", ws.branchName], ws.dir, 5 * 60_000);
  ws.keep = false;
  return diff;
}

/** Save an attempt's work when it stops early, so the next attempt can pick it up */
async function saveCheckpoint(claim, ws, job, log, reason) {
  const checkpoint = { branchName: "", note: (job.lastText || "").slice(-2000), diff: "" };
  if (ws.repo) {
    try {
      log("system", "Saving progress for the next attempt");
      const diff = await commitAndPush(ws, `[AgentBoard] WIP: ${claim.task.title} (${reason})`, log);
      if (diff !== null) Object.assign(checkpoint, { branchName: ws.branchName, diff });
    } catch (err) {
      log("system", `Could not save progress: ${err.message}`);
    }
  }
  // Nothing for the next attempt to continue from
  if (!checkpoint.branchName && !checkpoint.note) return undefined;
  return checkpoint;
}

/** Commit whatever the agent changed, push the branch and open a PR */
async function publishChanges(claim, ws, log) {
  const { task, repo } = claim;

  const diff = await commitAndPush(ws, `[AgentBoard] ${task.title}`, log);
  if (diff === null) {
    log("system", "No file changes to publish");
    return { branchName: "", prUrl: "", pushed: false, diff: "" };
  }

  let prUrl = "";
  try {
    prUrl = await openPullRequest(claim, ws);
    if (prUrl) log("system", `PR: ${prUrl}`);
  } catch (err) {
    const compare = githubCompareUrl(repo.url, repo.baseBranch, ws.branchName);
    log(
      "system",
      `Branch ${ws.branchName} is pushed but no PR was opened (${err.message}).` +
        (compare ? ` Open one here: ${compare}` : "")
    );
  }

  return { branchName: ws.branchName, prUrl, pushed: true, diff };
}

async function cleanupWorkspace(ws, log) {
  if (!ws.repo) return; // plain task folders are kept so you can look at the output
  if (ws.keep) {
    log("system", `Unpushed work kept on ${me.name} at ${ws.dir}`);
    return;
  }
  await withRepoLock(ws.repoDir, async () => {
    await git(["worktree", "remove", "--force", ws.dir], ws.repoDir).catch(() => {});
    await git(["branch", "-D", ws.branchName], ws.repoDir).catch(() => {});
  });
}

// ── Claude ─────────────────────────────────────────────────────────

// How Claude Code reports that its owner's usage (subscription limit / API rate limit) ran out
const USAGE_LIMIT_PATTERN =
  /usage limit|limit reached|hit your (?:[\w-]+ )?limit|out of (?:extra )?usage|rate_limit_error|API Error: 429/i;
// Stricter version for assistant text, so an agent merely discussing limits doesn't match
const USAGE_LIMIT_MESSAGE = /usage limit reached|hit your (?:[\w-]+ )?limit/i;

// Claude Code reports subscription usage in rate_limit_event messages, per window
const LIMIT_WINDOW_NAMES = {
  five_hour: "session",
  seven_day: "weekly",
  seven_day_opus: "weekly Opus",
  seven_day_sonnet: "weekly Sonnet",
  seven_day_overage_included: "weekly",
};

/** The most-used subscription window in a rate_limit_event (utilization is 0-1), or null */
function busiestWindow(info) {
  const windows = Object.entries(info.unifiedWindows ?? {}).map(([type, w]) => ({ type, ...w }));
  if (info.rateLimitType !== "overage") {
    windows.push({ type: info.rateLimitType, utilization: info.utilization, resetsAt: info.resetsAt });
  }
  let busiest = null;
  for (const w of windows) {
    if (typeof w.utilization === "number" && (!busiest || w.utilization > busiest.utilization)) busiest = w;
  }
  return busiest;
}

function epochToDate(seconds) {
  return typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * When does the limit reset? Understands "...limit reached|1759012345",
 * "resets 3pm", "resets at 11:30pm", "resets 23:00" and "resets Oct 3, 9am"
 * (in this machine's timezone). Returns null if it can't tell.
 */
function parseResetTime(text, now = new Date()) {
  const epoch = text.match(/\|(\d{10})\b/);
  if (epoch) return new Date(Number(epoch[1]) * 1000);

  const m = text.match(
    /resets?\s+(?:at\s+|on\s+)?(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s*(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (!m) return null;
  const [, month, day, hourText, minuteText, meridiem] = m;
  let hour = Number(hourText);
  if (meridiem) hour = (hour % 12) + (meridiem.toLowerCase() === "pm" ? 12 : 0);
  if (hour > 23) return null;

  const reset = new Date(now);
  reset.setHours(hour, Number(minuteText ?? 0), 0, 0);
  if (month) {
    const monthIndex = MONTHS.indexOf(month.toLowerCase());
    if (monthIndex < 0) return null;
    reset.setMonth(monthIndex, Number(day));
    if (reset < now) reset.setFullYear(reset.getFullYear() + 1);
  } else if (reset <= now) {
    reset.setDate(reset.getDate() + 1);
  }
  return reset;
}

function buildPrompt(claim, ws) {
  let prompt = `You are an autonomous AI agent. Complete the following task without asking questions.
Work in the current directory: ${ws.dir}`;
  if (ws.branchName) {
    prompt += `\nYou are working on branch: ${ws.branchName}`;
    prompt += `\nDo NOT create new branches or switch branches. Stay on the current branch.`;
    prompt += `\nDo NOT commit or push changes. The runner handles git automatically.`;
  }
  prompt += `\n\n${claim.instructions}`;
  if (claim.resume) prompt += resumeInstructions(claim, ws);
  prompt += `\n\nDo not ask clarifying questions. Execute the task to completion.`;
  prompt += `\nBefore your final message, stop any monitors and background tasks you started (TaskStop), so nothing is left running on this machine.`;
  return prompt;
}

function resumeInstructions(claim, ws) {
  const reviewHint = () => {
    const base = ws.baseCommit.slice(0, 12);
    return ` Start by reviewing it (\`git log --oneline ${base}..HEAD\` and \`git diff ${base}\`).`;
  };

  // Sent back with suggestions: earlier finished work is on the branch
  if (!claim.resume.note) {
    return ws.resumed
      ? `\n\n## Existing work\nEarlier work on this task is already on this branch.${reviewHint()} Build on it rather than starting over.`
      : "";
  }

  // An earlier attempt stopped before finishing (out of turns or usage)
  let text = `\n\n## Continuing earlier work\nA previous attempt at this task stopped before finishing.`;
  if (ws.resumed) {
    text += ` Its work so far is already on this branch.${reviewHint()} Then carry on from where it stopped instead of starting over.`;
  } else if (!ws.repo) {
    text += ` Anything it created may already be in the current directory; check before starting over.`;
  } else {
    text += ` Its changes aren't available, but use what it said to avoid repeating dead ends.`;
  }
  text += `\n\nIts last message was:\n> ${claim.resume.note.trim().replace(/\n/g, "\n> ")}`;
  text += `\n\nTurns are limited, so focus on finishing the remaining work.`;
  return text;
}

function usageFromResult(result) {
  const u = result?.usage ?? {};
  const inputTokens =
    (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const outputTokens = u.output_tokens ?? 0;
  // Fallback estimate at Sonnet list prices if Claude didn't report a cost
  const costEstimate =
    typeof result?.total_cost_usd === "number"
      ? result.total_cost_usd
      : (inputTokens / 1e6) * 3 + (outputTokens / 1e6) * 15;
  return { inputTokens, outputTokens, costEstimate: Math.round(costEstimate * 10000) / 10000 };
}

function addUsage(a, b) {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    costEstimate: Math.round((a.costEstimate + b.costEstimate) * 10000) / 10000,
  };
}

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, costEstimate: 0 };

function claudeArgs(model, extra) {
  const args = ["-p", ...extra];
  if (model) {
    if (/^[\w.\-[\]]+$/.test(model)) args.push("--model", model);
    else warn(`Ignoring invalid model name "${model}"`);
  }
  return args;
}

/** Run the agent, streaming its output to the board */
function runClaude(job, prompt, cwd, model, maxTurns, log) {
  return new Promise((resolve) => {
    const args = claudeArgs(model, [
      "--output-format", "stream-json", "--verbose",
      "--max-turns", String(maxTurns),
      "--permission-mode", config.permissionMode,
    ]);
    const child = spawnCommand(config.claude, args, { cwd, useShell: true });
    job.child = child;

    let result = null;
    let spawnError = null;
    let buffered = "";
    // Fallback usage if the run dies before its final result message
    const seenMessages = new Map();
    // Non-JSON output, where Claude Code reports things like usage limits
    let rawOutput = "";
    const keepRaw = (text) => {
      rawOutput = (rawOutput + "\n" + text).slice(-4000);
    };
    // Tools the agent asked for that haven't returned yet
    const pendingTools = new Set();
    // Claude Code said a usage limit refused the agent's request
    let limitHit = null;
    let stoppedForLimit = false;
    // Stops Claude if it keeps running after its final result
    let lingerTimer = null;
    let stoppedLingering = false;

    const stopForLimit = () => {
      if (stoppedForLimit) return;
      stoppedForLimit = true;
      log("system", "Stopping the agent before the usage limit cuts it off");
      killTree(child);
    };

    const noteRateLimit = (info) => {
      // Paid extra usage takes over at the limit, so nothing gets cut off
      if (info.overageStatus === "allowed" || info.overageStatus === "allowed_warning") return;
      if (info.status === "rejected") {
        const name = LIMIT_WINDOW_NAMES[info.rateLimitType] ?? "usage";
        limitHit = { resetAt: epochToDate(info.resetsAt), message: `Hit the Claude ${name} limit` };
        return;
      }
      const window = busiestWindow(info);
      if (job.nearLimit || !window || window.utilization * 100 < config.stopAt) return;
      const name = LIMIT_WINDOW_NAMES[window.type] ?? "usage";
      job.nearLimit = {
        resetAt: epochToDate(window.resetsAt ?? info.resetsAt),
        message: `Claude ${name} limit is ${Math.round(window.utilization * 100)}% used`,
      };
      log("system", `${job.nearLimit.message}, saving the work after the agent's current step`);
    };

    const handleLine = (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        log("stdout", line);
        keepRaw(line);
        return;
      }
      if (msg.type === "assistant" && msg.message?.content) {
        clearTimeout(lingerTimer); // the agent picked up again after a result
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            log("stdout", block.text);
            job.transcript.push(block.text);
            // Remembered for checkpoints; Claude Code's own limit notice isn't useful there
            if (!USAGE_LIMIT_MESSAGE.test(block.text)) job.lastText = block.text;
          } else if (block.type === "tool_use") {
            pendingTools.add(block.id);
            const text = `[Tool: ${block.name}] ${JSON.stringify(block.input).slice(0, 200)}`;
            log("stdout", text);
            job.transcript.push(text);
          }
        }
        if (msg.message.usage && msg.message.id) {
          seenMessages.set(msg.message.id, msg.message.usage);
        }
      } else if (msg.type === "rate_limit_event" && msg.rate_limit_info) {
        noteRateLimit(msg.rate_limit_info);
      } else if (msg.type === "user" && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === "tool_result") pendingTools.delete(block.tool_use_id);
        }
        // Stop between steps, once the tools the agent already started have finished
        if (job.nearLimit && pendingTools.size === 0) stopForLimit();
      } else if (msg.type === "result") {
        result = msg;
        // The final result usually repeats the last assistant message
        if (msg.result && msg.result !== job.transcript.at(-1)) log("stdout", msg.result);
        clearTimeout(lingerTimer);
        lingerTimer = setTimeout(() => {
          stoppedLingering = true;
          log("system", "Claude kept running after finishing (likely a monitor the agent left on), stopping it");
          killTree(child);
        }, RESULT_EXIT_GRACE_MS);
      }
    };

    child.stdout.on("data", (data) => {
      buffered += data.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop();
      lines.forEach(handleLine);
    });
    child.stderr.on("data", (data) => {
      const text = data.toString().trim();
      if (text) {
        log("stderr", text);
        keepRaw(text);
      }
    });
    child.on("error", (err) => {
      spawnError = err;
    });
    child.on("close", (code) => {
      handleLine(buffered);
      clearTimeout(lingerTimer);
      const usage = result
        ? usageFromResult(result)
        : [...seenMessages.values()].reduce(
            (acc, u) => addUsage(acc, usageFromResult({ usage: u })),
            EMPTY_USAGE
          );

      let error = "";
      if (spawnError) error = `Could not start Claude (${config.claude}): ${spawnError.message}`;
      else if (stoppedForLimit) error = job.nearLimit.message;
      else if (result?.subtype === "error_max_turns") error = `Agent hit the max turns limit (${maxTurns})`;
      else if (result?.is_error) error = `Agent reported an error: ${String(result.result || result.subtype).slice(0, 500)}`;
      else if (code !== 0 && !stoppedLingering) error = `Claude exited with code ${code}`;

      const outOfTurns = result?.subtype === "error_max_turns";

      // Out of Claude usage? Only checked when the run failed for another reason
      // than turns, so an agent merely talking about rate limits doesn't trigger it.
      let usageLimit = null;
      if (stoppedForLimit) {
        usageLimit = { ...job.nearLimit, early: true };
      } else if (error && limitHit) {
        usageLimit = limitHit;
      } else if (error && !spawnError && !outOfTurns) {
        const fromCli = [result?.result, rawOutput].filter(Boolean).join("\n");
        const lastAssistant = job.transcript.at(-1) ?? "";
        if (USAGE_LIMIT_PATTERN.test(fromCli) || USAGE_LIMIT_MESSAGE.test(lastAssistant)) {
          const text = `${fromCli}\n${lastAssistant}`;
          const resetAt = parseResetTime(text);
          usageLimit = {
            resetAt: resetAt && !isNaN(resetAt.getTime()) ? resetAt : null,
            message: (fromCli || lastAssistant).trim().split("\n")[0].slice(0, 300),
          };
        }
      }

      resolve({
        error,
        outOfTurns,
        usageLimit,
        nearLimit: job.nearLimit,
        usage,
        resultText: result?.result ?? "",
      });
    });

    child.stdin.end(prompt);
  });
}

/** Ask Haiku for a short summary and reusable project knowledge */
async function summarize(job, cwd) {
  const transcript = job.transcript.join("\n").slice(-8000);
  if (!transcript) return { summary: "", memories: [], usage: EMPTY_USAGE };

  const prompt = `Summarize what this AI agent did and extract reusable project knowledge.
Reply with ONLY a JSON object, no code fences:
{"summary": "one string of 3-5 concise '- ' bullet lines on actions taken and outcomes (files changed, commands run, decisions made)",
 "memories": [{"key": "...", "value": "..."}]}
Only put stable, reusable facts in memories (conventions, file paths, patterns). Use [] if there are none.

Agent logs:
${transcript}`;

  const out = await run(config.claude, claudeArgs("haiku", ["--output-format", "json"]), {
    cwd,
    input: prompt,
    timeout: SUMMARY_TIMEOUT_MS,
    useShell: true,
  });
  const envelope = JSON.parse(out);
  const usage = usageFromResult(envelope);
  let text = String(envelope.result ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();

  try {
    const parsed = JSON.parse(text);
    const memories = Array.isArray(parsed.memories)
      ? parsed.memories
          .filter((m) => m && m.key && m.value)
          .slice(0, 20)
          .map((m) => ({ key: String(m.key), value: String(m.value) }))
      : [];
    const summary = Array.isArray(parsed.summary)
      ? parsed.summary.map((line) => `- ${String(line).replace(/^[-*•]\s*/, "")}`).join("\n")
      : String(parsed.summary ?? "").trim();
    return { summary, memories, usage };
  } catch {
    return { summary: text, memories: [], usage };
  }
}

// ── Jobs ───────────────────────────────────────────────────────────

const jobs = new Map();
let me = { name: "runner" };
let shuttingDown = false;

// ── Usage limits ───────────────────────────────────────────────────

const MIN_PAUSE_MS = 60_000;
const FALLBACK_PAUSE_MS = 30 * 60_000; // when Claude doesn't say when the limit resets
const MAX_PAUSE_MS = 8 * 24 * 60 * 60_000;
const PAUSED_CHECK_IN_MS = 15_000;
let pausedUntil = 0;

function formatTime(ms) {
  const date = new Date(ms);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** Stop taking tasks until the owner's Claude usage resets */
function pauseForUsageLimit(resetAt, reason = "Out of Claude usage") {
  const now = Date.now();
  let until = resetAt ? resetAt.getTime() + 30_000 : now + FALLBACK_PAUSE_MS;
  until = Math.min(Math.max(until, now + MIN_PAUSE_MS), now + MAX_PAUSE_MS);
  if (until <= pausedUntil) return;
  pausedUntil = until;
  warn(
    `${reason}${resetAt ? "" : " (couldn't tell when it resets, will check again)"}. ` +
      `Pausing until ${formatTime(until)}; other agents take the tasks meanwhile.`
  );
}

/** Save progress, hand the task back without using a retry, and pause */
async function handBackForUsageLimit(claim, ws, job, agent, usage, log) {
  const { message, resetAt, early } = agent.usageLimit;
  log("system", early ? `Stopped early: ${message}` : `Claude usage limit reached: ${message}`);
  pauseForUsageLimit(resetAt, early ? message : undefined);

  const checkpoint = await saveCheckpoint(claim, ws, job, log, "out of Claude usage");
  await flushLogs(job);
  await apiWithRetry("POST", `/api/runner/tasks/${claim.task.id}/fail`, {
    runId: claim.runId,
    error: `${me.name} ran out of Claude usage`,
    usage,
    ...(checkpoint && { checkpoint }),
    requeue: true,
  }).catch((e) => warn(`Could not hand the task back to the board: ${e.message}`));
  info(`~ Handed "${claim.task.title}" back to the board (out of Claude usage)`);
  // Let the board show the pause right away rather than at the next check-in
  await requestWork().catch(() => {});
}

/** Ask the board for a task, or just check in while paused */
function requestWork() {
  const paused = Date.now() < pausedUntil;
  return api("POST", "/api/runner/claim", {
    boardIds: config.boards,
    concurrency: config.concurrency,
    version: VERSION,
    platform: `${process.platform}-${process.arch}`,
    ...(paused && { pausedUntil: new Date(pausedUntil).toISOString() }),
  });
}

/** Send buffered log lines, one batch at a time so they arrive in order */
function flushLogs(job) {
  job.flushChain = job.flushChain.then(() => sendPendingLogs(job));
  return job.flushChain;
}

async function sendPendingLogs(job) {
  while (job.pending.length > 0 && !job.superseded) {
    const batch = job.pending.splice(0, 500);
    try {
      await api("POST", `/api/runner/tasks/${job.taskId}/logs`, { runId: job.runId, logs: batch });
    } catch (err) {
      if (err.status === 409) {
        job.superseded = true; // the board moved on from this run
      } else {
        job.pending.unshift(...batch); // try again on the next tick
        if (job.pending.length > MAX_PENDING_LOGS) job.pending.splice(0, job.pending.length - MAX_PENDING_LOGS);
      }
      return;
    }
  }
}

async function runJob(claim) {
  const { runId, task } = claim;
  const short = task.id.slice(-8);
  const job = {
    taskId: task.id,
    runId,
    child: null,
    cancelled: false,
    superseded: false,
    pending: [],
    flushChain: Promise.resolve(),
    transcript: [],
    lastText: "",
    checkpoint: undefined,
    nearLimit: null,
  };
  jobs.set(task.id, job);

  const log = (stream, content) => {
    job.pending.push({ stream, content });
    if (config.verbose || stream === "system") {
      info(`[${short}] ${content.split("\n")[0].slice(0, 200)}`);
    }
  };

  const flushTimer = setInterval(() => flushLogs(job).catch(() => {}), LOG_FLUSH_INTERVAL_MS);

  const heartbeatTimer = setInterval(async () => {
    try {
      const { cancel } = await api("POST", `/api/runner/tasks/${task.id}/heartbeat`, { runId });
      if (cancel && !job.cancelled) {
        job.cancelled = true;
        log("system", "The board cancelled this run, stopping the agent");
        killTree(job.child);
      }
    } catch {
      // transient; the board re-queues the task if heartbeats stop for long
    }
  }, HEARTBEAT_INTERVAL_MS);

  info(`> Picked up "${task.title}" [${short}]`);
  let ws = null;
  let usage = EMPTY_USAGE;

  try {
    ws = await prepareWorkspace(claim, log);
    const maxTurns = claim.maxTurns ?? config.maxTurns;
    const agent = await runClaude(job, buildPrompt(claim, ws), ws.dir, task.model, maxTurns, log);
    usage = agent.usage;
    if (job.cancelled) return;
    if (agent.error) {
      if (agent.usageLimit) {
        await handBackForUsageLimit(claim, ws, job, agent, usage, log);
        return;
      }
      // Save whatever it got done, whatever stopped it, so the next attempt can continue
      const reason = agent.outOfTurns ? "ran out of turns" : "stopped with an error";
      job.checkpoint = await saveCheckpoint(claim, ws, job, log, reason);
      throw new Error(agent.error);
    }
    // Finished just under the limit: don't start another task until it resets
    if (agent.nearLimit) pauseForUsageLimit(agent.nearLimit.resetAt, agent.nearLimit.message);
    log("system", `Agent finished (${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out tokens)`);

    const published = ws.repo
      ? await publishChanges(claim, ws, log)
      : { branchName: "", prUrl: "", pushed: false, diff: "" };
    if (!ws.repo) log("system", `Output files are in ${ws.dir} on ${me.name}`);

    let extras = { summary: agent.resultText.slice(0, 4000), memories: [] };
    if (config.summary && !job.cancelled) {
      try {
        const s = await summarize(job, ws.dir);
        usage = addUsage(usage, s.usage);
        extras = { summary: s.summary || extras.summary, memories: s.memories };
      } catch (err) {
        log("system", `Summary skipped: ${err.message}`);
      }
    }
    if (job.cancelled) return;

    await flushLogs(job);
    await apiWithRetry("POST", `/api/runner/tasks/${task.id}/complete`, {
      runId,
      usage,
      ...published,
      ...extras,
    });
    info(`+ Finished "${task.title}"${published.prUrl ? ` - ${published.prUrl}` : ""}`);
  } catch (err) {
    if (job.cancelled) return;
    if (err instanceof ApiError && err.status === 409) {
      info(`- "${task.title}" was stopped or reassigned on the board`);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    log("system", `Error: ${message}`);
    await flushLogs(job).catch(() => {});
    await apiWithRetry("POST", `/api/runner/tasks/${task.id}/fail`, {
      runId,
      error: message.slice(0, 2000),
      usage,
      checkpoint: job.checkpoint,
    }).catch((e) => warn(`Could not report the failure to the board: ${e.message}`));
    info(`x Failed "${task.title}": ${message.split("\n")[0]}`);
  } finally {
    clearInterval(heartbeatTimer);
    if (job.cancelled && !shuttingDown) info(`- Stopped "${task.title}"`);
    if (ws && !shuttingDown) await cleanupWorkspace(ws, log).catch(() => {});
    clearInterval(flushTimer);
    await flushLogs(job).catch(() => {});
    jobs.delete(task.id);
  }
}

// ── Startup ────────────────────────────────────────────────────────

function checkTool(cmd, args, useShell) {
  const res = IS_WINDOWS && useShell
    ? spawnSync([winQuote(cmd), ...args].join(" "), { shell: true, encoding: "utf-8", env: childEnv(), windowsHide: true })
    : spawnSync(cmd, args, { encoding: "utf-8", env: childEnv() });
  return res.status === 0 ? (res.stdout || "").trim().split("\n")[0] : null;
}

async function shutdown(code) {
  if (shuttingDown) process.exit(code); // second Ctrl+C: leave now
  shuttingDown = true;
  if (jobs.size > 0) {
    info(`Stopping ${jobs.size} running task(s); the board will hand them to another agent...`);
  }
  await Promise.all(
    [...jobs.values()].map(async (job) => {
      job.cancelled = true;
      killTree(job.child);
      await api("POST", `/api/runner/tasks/${job.taskId}/fail`, {
        runId: job.runId,
        error: `Runner ${me.name} was shut down`,
        requeue: true,
      }).catch(() => {});
    })
  );
  process.exit(code);
}

async function main() {
  if (flags.help) {
    console.log(HELP);
    return;
  }
  if (!config.server || !config.token) {
    console.error(`Missing --server or --token.\n\n${HELP}`);
    process.exit(1);
  }
  if (parseInt(process.versions.node, 10) < 18) {
    console.error(`Node 18 or newer is required (you have ${process.versions.node}).`);
    process.exit(1);
  }

  console.log(`AgentBoard runner ${VERSION}\n`);
  if (config.permissionMode === "bypassPermissions") {
    console.log(
      "  Heads up: tasks run with Claude Code in bypassPermissions mode on THIS computer.\n" +
        "  Anyone who can add tasks to this board can make it run commands here, so only\n" +
        "  connect to boards run by people you trust. --permission-mode acceptEdits is safer.\n"
    );
  }

  const claudeVersion = checkTool(config.claude, ["--version"], true);
  if (!claudeVersion) {
    console.error(`Could not run "${config.claude} --version". Install Claude Code and log in first, or pass --claude <path>.`);
    process.exit(1);
  }
  if (!checkTool("git", ["--version"], false)) {
    warn("git was not found. Tasks on boards with a git repo will fail.");
  }
  if (!checkTool("gh", ["--version"], false)) {
    warn("GitHub CLI (gh) was not found. Branches will be pushed but PRs won't be opened automatically.");
  }

  try {
    me = await api("GET", "/api/runner/me");
  } catch (err) {
    console.error(
      err.status === 401
        ? "The board rejected this token. Ask for a new one in the board's Agents panel."
        : `Could not reach ${config.server}: ${err.message}`
    );
    process.exit(1);
  }

  fs.mkdirSync(config.workdir, { recursive: true });
  saveConfig();

  info(`Claude Code: ${claudeVersion}`);
  info(`Connected to ${config.server} as "${me.name}"${me.owner ? ` (${me.owner})` : ""}`);
  info(`Workspace: ${config.workdir}`);
  if (me.latestRunnerVersion && me.latestRunnerVersion !== VERSION) {
    warn(
      `The board has a different runner version (${me.latestRunnerVersion}, you have ${VERSION}). ` +
        `Download it again from ${config.server}/agentboard-runner.mjs and restart.`
    );
  }
  info(`Waiting for tasks (up to ${config.concurrency} at a time). Press Ctrl+C to stop.`);

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  let offline = false;
  let wasPaused = false;
  while (!shuttingDown) {
    const paused = Date.now() < pausedUntil;
    if (wasPaused && !paused) info("Claude usage should have reset. Looking for tasks again.");
    wasPaused = paused;

    // While paused we still check in, so the board shows why, but take no work
    if (paused || jobs.size < config.concurrency) {
      try {
        const claim = await requestWork();
        if (offline) {
          info("Reconnected to the board");
          offline = false;
        }
        if (claim && !paused) {
          runJob(claim);
          continue; // look for more work straight away
        }
      } catch (err) {
        if (err.status === 401) {
          warn("The board revoked this runner's token. Exiting.");
          await shutdown(1);
        }
        if (!offline) {
          warn(`Lost connection to the board (${err.message}). Retrying...`);
          offline = true;
        }
      }
    }
    await sleep(
      paused ? Math.max(1_000, Math.min(PAUSED_CHECK_IN_MS, pausedUntil - Date.now())) : POLL_INTERVAL_MS
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
