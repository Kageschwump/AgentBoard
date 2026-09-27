"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateRunner,
  useDeleteRunner,
  useRunnersQuery,
  type RunnerInfo,
} from "@/hooks/useTasksQuery";
import { toast } from "sonner";

interface AgentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          className="text-xs text-blue-400 hover:text-blue-300"
          onClick={() => {
            navigator.clipboard.writeText(text).then(
              () => toast.success("Copied"),
              () => toast.error("Couldn't copy, select the text instead")
            );
          }}
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}

function ConnectInstructions({ token, onDone }: { token: string; onDone: () => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const scriptUrl = `${origin}/agentboard-runner.mjs`;
  const args = `--server ${origin} --token ${token}`;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Send these steps to whoever runs this agent. The token is only shown now, so copy it.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Install <a className="text-blue-400 underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js 18+</a>,
          Claude Code (logged in), git, and the GitHub CLI (<code>gh auth login</code>) if the board uses a GitHub repo.
        </li>
        <li>Download the runner and start it with the command for your OS:</li>
      </ol>
      <CopyBlock
        label="Windows (PowerShell)"
        text={`Invoke-WebRequest ${scriptUrl} -OutFile agentboard-runner.mjs -UseBasicParsing\nnode agentboard-runner.mjs ${args}`}
      />
      <CopyBlock
        label="macOS / Linux"
        text={`curl -fsSLo agentboard-runner.mjs ${scriptUrl}\nnode agentboard-runner.mjs ${args}`}
      />
      <p className="text-xs text-muted-foreground">
        The runner saves these settings, so next time <code>node agentboard-runner.mjs</code> is
        enough. Add <code>--concurrency 2</code> to run two tasks at once.
      </p>
      <div className="flex justify-end">
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function RunnerRow({ runner }: { runner: RunnerInfo }) {
  const deleteRunner = useDeleteRunner();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-md border border-border/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${runner.online ? "bg-green-500" : "bg-muted-foreground/40"}`}
              title={runner.online ? "Online" : "Offline"}
            />
            <span className="truncate text-sm font-medium">{runner.name}</span>
            {runner.owner && (
              <span className="truncate text-xs text-muted-foreground">{runner.owner}</span>
            )}
            {runner.outdated && (
              <span
                className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400"
                title="Download the runner script again and restart it"
              >
                update runner
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {runner.online ? "Online" : `Last seen ${timeAgo(runner.lastSeenAt)}`}
            {runner.platform && ` · ${runner.platform}`}
            {runner.lastSeenAt && ` · up to ${runner.concurrency} at a time`}
            {` · token ${runner.tokenPrefix}…`}
          </div>
          {runner.activeTasks.length > 0 && (
            <div className="mt-1 text-xs text-blue-400">
              Working on: {runner.activeTasks.map((t) => t.title).join(", ")}
            </div>
          )}
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteRunner.isPending}
              onClick={() =>
                deleteRunner.mutate(runner.id, {
                  onSuccess: () => toast.success(`${runner.name} disconnected`),
                  onError: (err) => toast.error(err.message),
                })
              }
            >
              Revoke
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={() => setConfirming(true)}
          >
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}

export function AgentsPanel({ open, onOpenChange }: AgentsPanelProps) {
  const { data: runners = [], isLoading } = useRunnersQuery(open);
  const createRunner = useCreateRunner();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createRunner.mutate(
      { name: name.trim(), owner: owner.trim() },
      {
        onSuccess: (runner) => {
          setNewToken(runner.token);
          setName("");
          setOwner("");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setNewToken(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Agents</DialogTitle>
        </DialogHeader>

        {newToken ? (
          <ConnectInstructions token={newToken} onDone={() => setNewToken(null)} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each person runs Claude Code on their own machine with their own subscription. A
              connected agent picks up tasks from the Ready column.
            </p>

            <div className="space-y-2">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : runners.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No agents connected yet.</p>
              ) : (
                runners.map((runner) => <RunnerRow key={runner.id} runner={runner} />)
              )}
            </div>

            <form onSubmit={handleCreate} className="space-y-2 rounded-md bg-muted/30 p-3">
              <h4 className="text-sm font-medium">Connect a new agent</h4>
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name, e.g. kasper-desktop"
                  className="text-sm"
                />
                <Input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Owner (optional)"
                  className="text-sm"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!name.trim() || createRunner.isPending}>
                  {createRunner.isPending ? "Creating..." : "Create token"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
