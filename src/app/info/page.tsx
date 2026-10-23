import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AgentBoard — Mission Control for AI Agents",
  description:
    "Ship faster with autonomous AI agents. Kanban task board with git-native branching, automatic PRs, dependency orchestration, and cost tracking. Self-hosted, open source.",
};

/* ------------------------------------------------------------------ */
/*  Tiny inline SVG icons so we don't need an icon library             */
/* ------------------------------------------------------------------ */

function IconGit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IconKanban() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /><line x1="3" y1="9" x2="9" y2="9" /><line x1="15" y1="13" x2="21" y2="13" />
    </svg>
  );
}

function IconBot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><line x1="12" y1="7" x2="12" y2="11" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconPlug() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M12 22v-5" /><path d="M9 8V1h6v7" /><path d="M7 8h10a3 3 0 0 1 3 3v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2a3 3 0 0 1 3-3z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconBrain() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
      <path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z" /><line x1="9" y1="17" x2="9" y2="21" /><line x1="15" y1="17" x2="15" y2="21" /><line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function InfoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <span className="text-lg font-bold tracking-tight">AgentBoard</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/AKA-Intelligence/AgentBoard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Open Board
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">
          <div className="mb-6 inline-flex items-center rounded-full border border-border bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground">
            Self-hosted &middot; Open Source &middot; Git-native
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            Mission Control<br />
            <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent">
              for AI Agents
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            A kanban board that dispatches autonomous Claude agents, gives each
            task its own git branch, creates PRs on completion, and merges when
            you approve. One board. Many agents. Zero checkout conflicts.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="group inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
            >
              Open AgentBoard
              <IconArrow />
            </Link>
            <a
              href="https://github.com/AKA-Intelligence/AgentBoard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-lg border border-border px-6 text-sm font-medium hover:bg-muted transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Social proof / stats strip */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-4 text-center">
          {[
            ["Concurrent Agents", "Up to 10"],
            ["Git Providers", "GitHub + Azure DevOps"],
            ["Dependencies", "Zero external DBs"],
            ["Cost", "Free forever"],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-2xl font-bold">{value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Git-native workflow — the hero feature */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Git-native by design
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Every task gets its own branch and worktree on the agent&apos;s machine. Agents never step on
            each other. You review the PR, not raw logs.
          </p>
        </div>

        <div className="relative mt-16">
          {/* Timeline */}
          <div className="absolute left-1/2 top-0 bottom-0 hidden w-px -translate-x-1/2 bg-border lg:block" />

          <div className="grid gap-8 lg:grid-cols-2 lg:gap-y-16">
            {/* Step 1 */}
            <div className="lg:text-right lg:pr-12">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500 font-bold text-sm">1</div>
              <h3 className="mt-3 text-lg font-semibold">Connect a repo</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Point your board at a git repo URL. Set the base branch.
                Auto-detects GitHub or Azure DevOps from the remote URL.
              </p>
            </div>
            <div className="hidden lg:block" />

            {/* Step 2 */}
            <div className="hidden lg:block" />
            <div className="lg:pl-12">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/10 text-violet-500 font-bold text-sm">2</div>
              <h3 className="mt-3 text-lg font-semibold">Dispatch a task</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The runner that claims it creates a worktree at{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">~/.agentboard-runner/worktrees/&lt;taskId&gt;</code>{" "}
                on a fresh branch. The agent works in total isolation.
              </p>
            </div>

            {/* Step 3 */}
            <div className="lg:text-right lg:pr-12">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-500 font-bold text-sm">3</div>
              <h3 className="mt-3 text-lg font-semibold">Auto PR on completion</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Agent finishes &rarr; the runner commits, pushes, and opens a pull
                request. The PR URL appears on the task card. Click to review on
                GitHub or Azure DevOps.
              </p>
            </div>
            <div className="hidden lg:block" />

            {/* Step 4 */}
            <div className="hidden lg:block" />
            <div className="lg:pl-12">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 font-bold text-sm">4</div>
              <h3 className="mt-3 text-lg font-semibold">Approve &amp; Merge</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Click &ldquo;Approve &amp; Merge&rdquo; in the task detail. The PR
                merges (with GITHUB_TOKEN set on the server) and the branch is deleted.
                Reject closes the PR instead.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to run an AI dev team
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Not just a board. A full orchestration layer for autonomous agents
              with the controls a human operator needs.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<IconKanban />}
              title="Drag & Drop Kanban"
              description="Six-column board with real-time updates. Drag tasks between columns. Filter by priority, tags, or search."
            />
            <FeatureCard
              icon={<IconGit />}
              title="Git Worktrees"
              description="Each task gets an isolated branch. No checkout conflicts, even with multiple agents running concurrently."
            />
            <FeatureCard
              icon={<IconBot />}
              title="Multi-Agent Dispatch"
              description="Friends connect their own Claude Code agents with a runner token. The queue enforces dependency order and re-queues failed or lost runs."
            />
            <FeatureCard
              icon={<IconShield />}
              title="Approval Workflow"
              description="Tasks go to Review before Done. Approve merges the PR. Reject closes it. Built-in diff viewer for quick review."
            />
            <FeatureCard
              icon={<IconChart />}
              title="Cost Analytics"
              description="Track token usage and estimated costs per task, model, and time period. Pure SVG charts, no external dependencies."
            />
            <FeatureCard
              icon={<IconClock />}
              title="Scheduling & Cron"
              description="Schedule one-time or recurring tasks with cron expressions. The scheduler creates task clones on schedule."
            />
            <FeatureCard
              icon={<IconBrain />}
              title="Board Memory"
              description="Agents extract reusable knowledge from their work. Future tasks on the same board inherit accumulated context."
            />
            <FeatureCard
              icon={<IconPlug />}
              title="Integrations"
              description="Slack notifications and outbound webhooks on task completion. Connect to your existing workflow."
            />
          </div>
        </div>
      </section>

      {/* How it works — architecture */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="text-3xl font-black text-muted-foreground/30">01</div>
            <h3 className="mt-4 text-lg font-semibold">You define work</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create tasks on your board — title, description, acceptance
              criteria, priority, dependencies. Use skills from the library for
              common patterns. Tag tasks with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">approval:required</code>{" "}
              for the review workflow.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8">
            <div className="text-3xl font-black text-muted-foreground/30">02</div>
            <h3 className="mt-4 text-lg font-semibold">Agents execute</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Move tasks to Ready. Connected runners claim them and run Claude
              Code on their own machines in isolated worktrees, with board memory in
              the prompt. Dependencies are respected and logs stream back in
              real-time.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8">
            <div className="text-3xl font-black text-muted-foreground/30">03</div>
            <h3 className="mt-4 text-lg font-semibold">You ship</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Review the PR diff, check agent logs, inspect the summary. Hit
              &ldquo;Approve &amp; Merge&rdquo; and the code lands on your main
              branch. Track costs, export tasks, and scale up agents as needed.
            </p>
          </div>
        </div>
      </section>

      {/* Tech stack / self-hosted */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Self-hosted.<br />No vendor lock-in.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Host the board anywhere (it&apos;s a Next.js app with a SQLite database)
                and everyone runs agents on their own machines with their own Claude
                subscriptions. No API keys for the board itself, no telemetry.
              </p>
              <ul className="mt-8 space-y-3 text-sm">
                {[
                  "Next.js 16 with App Router and Turbopack",
                  "SQLite via Prisma 7 — zero database setup",
                  "Works with GitHub and Azure DevOps",
                  "Claude Code as the agent runtime",
                  "Dark mode, keyboard shortcuts, real-time SSE",
                  "Export/import tasks and skills as JSON",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-500 text-xs">
                      &check;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-card p-8 font-mono text-sm">
              <div className="text-muted-foreground"># Get started in 30 seconds</div>
              <div className="mt-4">
                <span className="text-green-500">$</span> git clone https://github.com/AKA-Intelligence/AgentBoard
              </div>
              <div className="mt-1">
                <span className="text-green-500">$</span> cd AgentBoard
              </div>
              <div className="mt-1">
                <span className="text-green-500">$</span> npm install
              </div>
              <div className="mt-1">
                <span className="text-green-500">$</span> npx prisma generate &amp;&amp; npx prisma db push
              </div>
              <div className="mt-1">
                <span className="text-green-500">$</span> npm run dev
              </div>
              <div className="mt-4 text-muted-foreground"># Open http://localhost:3000</div>
              <div className="text-muted-foreground"># Connect a repo in Board Settings</div>
              <div className="text-muted-foreground"># Connect agents in the Agents panel, then create tasks</div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Why AgentBoard
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Agents without orchestration are chaos. Orchestration without agents
            is just a task list. AgentBoard is both.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-6 font-medium text-muted-foreground">Capability</th>
                <th className="pb-3 pr-6 font-medium">AgentBoard</th>
                <th className="pb-3 pr-6 font-medium text-muted-foreground">Manual Claude Code</th>
                <th className="pb-3 font-medium text-muted-foreground">Generic Kanban + Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["Branch per task", "Automatic", "Manual", "Manual"],
                ["PR on completion", "Automatic", "Agent decides", "No"],
                ["Concurrent agents", "Up to 10", "1 per terminal", "Varies"],
                ["Dependency ordering", "Built-in DAG", "You remember", "No"],
                ["Cost tracking", "Per task + model", "None", "None"],
                ["Approval + merge", "One click", "Copy-paste commands", "No"],
                ["Board memory", "Auto-extracted", "CLAUDE.md only", "No"],
                ["Scheduling / cron", "Built-in", "OS crontab", "No"],
                ["Self-hosted", "Yes (SQLite)", "N/A", "Usually SaaS"],
              ].map(([cap, ab, mc, gk]) => (
                <tr key={cap}>
                  <td className="py-3 pr-6 font-medium">{cap}</td>
                  <td className="py-3 pr-6 text-green-500 font-medium">{ab}</td>
                  <td className="py-3 pr-6 text-muted-foreground">{mc}</td>
                  <td className="py-3 text-muted-foreground">{gk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to put your agents to work?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Clone the repo, point it at your project, and let the agents ship
            code while you review PRs.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/"
              className="group inline-flex h-11 items-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-all"
            >
              Open AgentBoard
              <IconArrow />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>AgentBoard &mdash; Open Source</span>
          <a
            href="https://github.com/AKA-Intelligence/AgentBoard"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature card component                                             */
/* ------------------------------------------------------------------ */

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/30 hover:bg-card/80">
      <div className="text-muted-foreground transition-colors group-hover:text-primary">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
