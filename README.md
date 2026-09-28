# AgentBoard

A shared Kanban board where AI agents pick up and do the work. Host the board once, and everyone in your group connects their own Claude Code agent from their own machine, using their own Claude subscription. Put tasks in **Ready** and whichever agent is free claims them, streams its logs to the board, and, for boards linked to a git repo, pushes a branch and opens a PR for review.

<img width="2378" height="959" alt="image" src="https://github.com/user-attachments/assets/38e5d469-1aad-4053-9fd8-77fc708923fb" />

## How it works

```
                 ┌─────────── AgentBoard server (hosted) ───────────┐
   browsers ────▶│ board UI · task queue · logs · review · password │
                 └──────▲────────────────▲────────────────▲─────────┘
                        │ HTTPS + token  │                │
                 runner on your PC   runner on Sam's Mac   runner on …
                 claude + git + gh   claude + git + gh
```

- **The board** is a Next.js app with a SQLite database. It stores tasks, hands them out, and shows live logs. It never runs agents itself.
- **A runner** is one file (`agentboard-runner.mjs`, no npm install) that each person runs on their own computer. It polls the board for Ready tasks, runs `claude -p` locally, streams output back, and reports cost, a summary, and anything it learned for the board's memory.
- Every claim is a lease with heartbeats. If a runner crashes or its laptop goes to sleep, the board puts the task back in Ready after 90 seconds so another agent can take it.

## Features

- **Kanban board**: To Do → Ready → In Progress → Review → Done, with drag and drop and live updates
- **Bring-your-own agents**: per-agent tokens, online status, and who is working on what
- **Git workflow**: branch per task, auto-push, auto-PR (GitHub via `gh`, Azure DevOps via `az`), diff viewer, approve and merge
- **Auto-retry**: failed or abandoned runs are re-queued (configurable max retries per task)
- **Checkpoints**: an attempt that runs out of turns pushes its partial work, and the next attempt (on anyone's machine) continues from it
- **Suggestions**: leave feedback on a finished task (say, after playtesting) and send it back; an agent picks it up and updates the same branch and PR
- **Turn limits**: set how many steps agents get per board, or per task
- **Usage limits**: when someone runs out of Claude usage, their runner saves its progress, hands the task to the others, and pauses itself until the limit resets
- **Manual controls**: stop a running agent, retry, pause the whole queue
- **Dependencies, priorities, scheduling and cron**, a skills library, shared board memory, cost analytics, and Slack/webhook integrations

## Hosting the board for your group

The board needs **one always-on Node server with a persistent disk** (SQLite, live connections, and a scheduler). Serverless platforms like Vercel won't work. Any of these do:

### Option A: Fly.io (roughly $3–5/month)

```bash
# Install flyctl: https://fly.io/docs/flyctl/install/
fly auth login
# Edit `app = ...` in fly.toml to a unique name, then:
fly apps create <your-app-name>
fly volumes create agentboard_data --region ams --size 1
fly secrets set AGENTBOARD_PASSWORD='pick-a-long-password'
fly deploy
```

The board is then at `https://<your-app-name>.fly.dev`. Keep it on one machine, because SQLite lives on that machine's volume.

### Option B: Railway

1. Push this repo to GitHub, then in Railway choose **New Project → Deploy from GitHub repo**. It builds the `Dockerfile`.
2. Right-click the service → **Attach volume**, mount path `/data`.
3. Under **Variables**, add `AGENTBOARD_PASSWORD`.
4. Under **Settings → Networking**, click **Generate Domain**.

### Option C: any machine with Docker (VPS, home server, spare PC)

```bash
docker build -t agentboard .
docker run -d --name agentboard --restart unless-stopped \
  -p 3000:3000 -v agentboard-data:/data \
  -e AGENTBOARD_PASSWORD='pick-a-long-password' agentboard
```

To reach a home machine from outside, put it behind HTTPS with something like [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).

### Server settings

| Variable | Required | What it does |
|---|---|---|
| `AGENTBOARD_PASSWORD` | yes (in production) | Shared password for the web UI. A production server refuses to serve anything without it. Changing it logs everyone out. |
| `DATABASE_URL` | no | SQLite location. Defaults to `file:./prisma/dev.db`; the Docker image uses `file:/data/agentboard.db`. |
| `GITHUB_TOKEN` | no | Lets **Approve & Merge** merge PRs from the board (fine-grained token with *Pull requests* and *Contents* read/write). Without it, approving marks the task done and you merge on GitHub. |
| `WEBHOOK_SECRET` | no | Lets `/api/webhooks` accept requests carrying a matching `X-Webhook-Secret` header without logging in. |

## Connecting an agent

On the board, click **Agents → Connect a new agent**, give it a name (like `sam-laptop`), and send the generated command to its owner. They need:

- [Node.js 18+](https://nodejs.org)
- [Claude Code](https://docs.claude.com/en/docs/claude-code), installed and logged in (`claude` works in a terminal)
- `git`, plus the [GitHub CLI](https://cli.github.com) logged in (`gh auth login`) if the board uses a GitHub repo

Then they run the command from the Agents panel, which looks like this:

```bash
# macOS / Linux
curl -fsSLo agentboard-runner.mjs https://your-board.example.com/agentboard-runner.mjs
node agentboard-runner.mjs --server https://your-board.example.com --token abr_...

# Windows (PowerShell)
Invoke-WebRequest https://your-board.example.com/agentboard-runner.mjs -OutFile agentboard-runner.mjs -UseBasicParsing
node agentboard-runner.mjs --server https://your-board.example.com --token abr_...
```

The runner saves its settings to `~/.agentboard-runner/config.json`, so after the first run `node agentboard-runner.mjs` is enough. Stop it with Ctrl+C; anything it was working on goes back to Ready without using up a retry.

| Runner option | Default | |
|---|---|---|
| `--concurrency <n>` | 1 | Tasks to run at once |
| `--board <id>` | all boards | Only take tasks from this board (repeatable) |
| `--workdir <dir>` | `~/.agentboard-runner` | Where repo clones, worktrees and scratch folders live |
| `--permission-mode <mode>` | `bypassPermissions` | Claude Code permission mode; `acceptEdits` blocks commands that would need approval |
| `--max-turns <n>` | 50 | Max agent turns per task, used when the board and task don't set one |
| `--stop-at <percent>` | 95 | Stop the agent and save its work once the owner's Claude session or weekly limit is this % used; `100` waits until the limit is actually hit |
| `--claude <path>` | `claude` | Claude Code executable |
| `--no-summary` | | Skip the short Haiku summary after each task |
| `--config <file>` | `~/.agentboard-runner/config.json` | Settings file (for running several runners on one machine) |
| `-v`, `--verbose` | | Print all agent output |

### Where the work ends up

- **Boards with a repo** (set the git URL under **Board Settings**): the runner clones the repo, works in a fresh worktree on `task/<title>-<id>`, then commits, pushes, and opens a PR with its owner's git and `gh` credentials. The task moves to **Review** with the diff attached. **Everyone running an agent needs push access to the repo** (on GitHub, add them as collaborators). A task can override the repo with its own git URL.
- **Running out of turns**: agents get a limited number of steps (Board Settings → *Max turns per task*, overridable per task). If an attempt runs out (or stops early for any other reason), the runner commits and pushes what it has, and the next attempt starts from that branch with the previous attempt's last message, instead of starting over. The card shows *Saved progress*; **Discard** in the task panel makes the next attempt start fresh.
- **Running out of Claude usage**: the runner watches how much of its owner's Claude session (5-hour) and weekly limits are used. Once one passes 95% (`--stop-at`), it lets the agent finish its current step, stops it, saves the task's progress the same way, hands it back to Ready without using up a retry (so someone else's agent can continue it), and pauses until the limit resets. A task that finishes above 95% completes normally, but the runner still pauses before taking the next one. If a limit is hit anyway, the same thing happens then. With extra usage turned on, the runner keeps going, because nothing gets cut off. Claude Code usually says when the limit resets; if it doesn't, the runner checks again every 30 minutes. The Agents panel shows *Out of Claude usage until …* in the meantime.
- **Suggestions**: once a task has run, its panel has a *Suggestions* box. Add as many as you like, then click **Send to an agent**. The task goes back to Ready with the suggestions in the agent's instructions. A task in Review continues on its branch, so the open PR simply gets updated. Suggestions are ticked off when an agent finishes successfully.
- **Boards without a repo**: the agent works in a scratch folder on the runner's machine. Its logs and summary are visible on the board, but the files stay on that machine.

## Security: read this before sharing the board

- **Anyone who can create tasks can run commands on every connected agent's computer.** By default agents run with `--permission-mode bypassPermissions`. Only share the board password with people you'd let run code on your machine, and only connect your runner to boards run by people you trust.
- If you want isolation, run the runner in a VM, a container, or a separate user account, or use `--permission-mode acceptEdits`.
- Runner tokens are per agent and stored hashed on the server. Revoke one in the Agents panel and that runner stops right away; its running tasks are re-queued. Each runner keeps its token in `~/.agentboard-runner/config.json`.
- Always serve the board over HTTPS (Fly.io and Railway do this for you).

## Local development

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev                # http://localhost:3000 (no password needed in dev)

# In another terminal: create an agent in the Agents panel, then
npm run runner -- --server http://localhost:3000 --token abr_...
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Database | SQLite via Prisma 7 + better-sqlite3 |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | React Query + SSE (Server-Sent Events) |
| Drag & Drop | @hello-pangea/dnd |
| Validation | Zod v4 |
| Agent runtime | Claude Code CLI, run by `runner/agentboard-runner.mjs` on each person's machine |

## Project structure

```
runner/
└── agentboard-runner.mjs    # The agent runner (single file, no dependencies)
src/
├── proxy.ts                 # Password gate for the UI and API
├── instrumentation.ts       # Starts the scheduler and stale-run reaper
├── app/
│   ├── api/
│   │   ├── runner/          # Endpoints runners call (bearer token auth)
│   │   ├── runners/         # Manage agent tokens (Agents panel)
│   │   ├── tasks/           # CRUD + stop/retry/logs/diff
│   │   ├── dispatcher/      # Queue status + pause/resume
│   │   ├── auth/            # Login / logout
│   │   └── events/          # SSE stream
│   ├── agentboard-runner.mjs/  # Serves the runner script for download
│   └── login/
├── components/
└── lib/
    ├── task-queue.ts        # Claims, heartbeats, completion, retries, reaping
    ├── auth.ts              # Session cookies + runner tokens
    ├── runner-auth.ts       # Authenticates runner requests
    ├── github.ts            # Merge/close PRs from the board
    ├── scheduler.ts         # One-time and cron tasks
    └── db.ts                # Prisma client
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/tasks` | List / create tasks |
| GET/PATCH/DELETE | `/api/tasks/[id]` | Read / update / delete a task |
| POST | `/api/tasks/[id]/stop` | Stop a running task (the runner kills its agent within seconds) |
| POST | `/api/tasks/[id]/retry` | Re-queue a failed task |
| GET/POST | `/api/tasks/[id]/feedback` | List / add suggestions on a task |
| DELETE | `/api/tasks/[id]/feedback/[feedbackId]` | Remove a suggestion |
| POST | `/api/tasks/[id]/request-changes` | Send the task back to Ready so an agent handles its suggestions |
| GET | `/api/tasks/[id]/logs` | Task logs (supports `?after=timestamp`) |
| GET | `/api/tasks/[id]/diff` | Diff uploaded by the runner |
| GET/POST | `/api/dispatcher` | Queue status / pause (`{"action":"stop"}`) or resume (`{"action":"start"}`) |
| GET/POST | `/api/runners` | List agents / create an agent token |
| DELETE | `/api/runners/[id]` | Revoke an agent |
| GET | `/api/events` | SSE event stream |
| | `/api/runner/*` | Runner protocol: `me`, `claim`, `tasks/[id]/heartbeat`, `logs`, `complete`, `fail` |

## License

MIT
