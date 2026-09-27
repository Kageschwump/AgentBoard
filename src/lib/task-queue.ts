import crypto from "crypto";
import { prisma } from "./db";
import { emitEvent } from "./event-emitter";
import { isQueuePaused } from "./settings";
import { fireIntegrations } from "./integration-dispatcher";
import type { Runner, Task } from "@/generated/prisma/client";

/**
 * The task queue that remote runners pull from.
 *
 * Each claim creates a fresh `runId` lease. Every runner call for that attempt
 * must present the same runId; once the task is stopped, re-queued or claimed
 * again, calls from the old attempt are rejected and its heartbeat tells the
 * runner to kill the agent.
 */

/** A run with no heartbeat for this long is considered lost and re-queued */
export const HEARTBEAT_TIMEOUT_MS = 90_000;
const MAX_LOG_CHARS = 20_000;
const MAX_DIFF_CHARS = 1_000_000;
const MAX_MEMORIES_PER_RUN = 20;

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
}

export interface ClaimPayload {
  runId: string;
  task: {
    id: string;
    title: string;
    model: string;
    boardId: string;
    retryCount: number;
  };
  /** Task description, acceptance criteria and board knowledge, ready for the agent */
  instructions: string;
  repo: { url: string; baseBranch: string; gitProvider: string } | null;
  /** Agent turn limit from the task or board; null = the runner's own default */
  maxTurns: number | null;
  /** Progress saved by an earlier attempt that ran out of turns */
  resume: { branch: string; note: string } | null;
}

/** Partial work saved by an attempt that ran out of turns */
export interface Checkpoint {
  branchName: string;
  note: string;
  diff: string;
}

export interface RunResult {
  usage: RunUsage;
  branchName: string;
  prUrl: string;
  /** Whether the runner pushed a branch with changes */
  pushed: boolean;
  diff: string;
  summary: string;
  memories: { key: string; value: string }[];
}

function usageIncrement(usage?: RunUsage) {
  if (!usage) return {};
  return {
    inputTokens: { increment: Math.max(0, Math.round(usage.inputTokens)) },
    outputTokens: { increment: Math.max(0, Math.round(usage.outputTokens)) },
    costEstimate: { increment: Math.max(0, usage.costEstimate) },
  };
}

async function writeSystemLog(taskId: string, content: string) {
  await prisma.taskLog.create({ data: { taskId, stream: "system", content } });
  emitEvent({ type: "task:log", taskId, content, stream: "system" });
}

export function runnerLabel(runner: Pick<Runner, "name" | "owner">): string {
  return runner.owner ? `${runner.name} (${runner.owner})` : runner.name;
}

async function dependenciesDone(task: Task): Promise<boolean> {
  if (!task.dependsOn) return true;
  try {
    const depIds: string[] = JSON.parse(task.dependsOn);
    if (depIds.length === 0) return true;
    const deps = await prisma.task.findMany({
      where: { id: { in: depIds } },
      select: { id: true, status: true },
    });
    return depIds.every((id) => deps.find((d) => d.id === id)?.status === "done");
  } catch {
    return true; // Invalid JSON in dependsOn, treat as no dependencies
  }
}

async function buildInstructions(task: Task): Promise<string> {
  let prompt = `Task: ${task.title}`;
  if (task.description) {
    prompt += `\n\nDescription:\n${task.description}`;
  }
  if (task.criteria) {
    prompt += `\n\nAcceptance Criteria:\n${task.criteria}`;
  }

  const feedback = await prisma.feedback.findMany({
    where: { taskId: task.id, addressedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (feedback.length > 0) {
    const items = feedback.map((f) => `- ${f.content.trim().replace(/\n/g, "\n  ")}`).join("\n");
    prompt +=
      `\n\n## Changes requested\nThis task has been worked on before. People reviewing or playtesting ` +
      `the result left these suggestions. Build on the existing work and address every one:\n${items}`;
  }

  try {
    const memories = await prisma.memory.findMany({
      where: { boardId: task.boardId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    if (memories.length > 0) {
      const lines = memories.map((m) => `- ${m.key}: ${m.value}`).join("\n");
      prompt += `\n\n## Project Knowledge Base\nThe following knowledge has been accumulated from previous tasks:\n${lines}`;
    }
  } catch {
    // Non-critical: proceed without memories
  }

  return prompt;
}

/**
 * Hand the highest-priority ready task to a runner, or null if there's nothing
 * to do. Safe against several runners claiming at once.
 */
export async function claimTask(
  runner: Runner,
  boardIds: string[]
): Promise<ClaimPayload | null> {
  if (await isQueuePaused()) return null;

  const candidates = await prisma.task.findMany({
    where: {
      status: "ready",
      ...(boardIds.length > 0 && { boardId: { in: boardIds } }),
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 25,
  });

  for (const task of candidates) {
    if (!(await dependenciesDone(task))) continue;

    const runId = crypto.randomUUID();
    const now = new Date();
    const { count } = await prisma.task.updateMany({
      where: { id: task.id, status: "ready" },
      data: {
        status: "in_progress",
        runId,
        runnerId: runner.id,
        runnerName: runnerLabel(runner),
        startedAt: now,
        heartbeatAt: now,
        completedAt: null,
        branchName: "",
        prUrl: "",
        diff: "",
        summary: null,
      },
    });
    if (count === 0) continue; // another runner got it first

    await writeSystemLog(task.id, `Claimed by ${runnerLabel(runner)}`);
    emitEvent({ type: "task:updated", taskId: task.id });

    const board = await prisma.board.findUnique({ where: { id: task.boardId } });
    const repoUrl = task.repoUrl.trim() || board?.repoUrl.trim() || "";

    return {
      runId,
      task: {
        id: task.id,
        title: task.title,
        model: task.model,
        boardId: task.boardId,
        retryCount: task.retryCount,
      },
      instructions: await buildInstructions(task),
      repo: repoUrl
        ? {
            url: repoUrl,
            baseBranch: board?.baseBranch || "main",
            gitProvider: board?.gitProvider || "",
          }
        : null,
      maxTurns: task.maxTurns || board?.maxTurns || null,
      resume:
        task.resumeBranch || task.resumeNote
          ? { branch: task.resumeBranch, note: task.resumeNote }
          : null,
    };
  }

  return null;
}

/** Record a heartbeat; `cancel: true` tells the runner to kill the agent */
export async function recordHeartbeat(
  runner: Runner,
  taskId: string,
  runId: string
): Promise<{ cancel: boolean }> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runId, runnerId: runner.id, status: "in_progress" },
    data: { heartbeatAt: new Date() },
  });
  return { cancel: count === 0 };
}

/** Store streamed agent output. Returns false if the run is no longer current. */
export async function appendLogs(
  runner: Runner,
  taskId: string,
  runId: string,
  logs: { stream: string; content: string }[]
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, runId, runnerId: runner.id },
    select: { id: true },
  });
  if (!task) return false;

  const rows = logs.map((log) => ({
    taskId,
    stream: log.stream,
    content: log.content.slice(0, MAX_LOG_CHARS),
  }));
  await prisma.taskLog.createMany({ data: rows });
  for (const row of rows) {
    emitEvent({ type: "task:log", taskId, content: row.content, stream: row.stream });
  }
  return true;
}

export async function completeRun(
  runner: Runner,
  taskId: string,
  runId: string,
  result: RunResult
): Promise<boolean> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, runId, runnerId: runner.id, status: "in_progress" },
  });
  if (!task) return false;

  const needsApproval = task.tags
    .split(",")
    .map((t) => t.trim())
    .includes("approval:required");
  // Pushed work always gets a human look before it counts as done
  const finalStatus = needsApproval || result.prUrl || result.pushed ? "review" : "done";

  const { count } = await prisma.task.updateMany({
    where: { id: taskId, runId, status: "in_progress" },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      heartbeatAt: null,
      branchName: result.branchName,
      prUrl: result.prUrl,
      diff: result.diff.slice(0, MAX_DIFF_CHARS),
      resumeBranch: "",
      resumeNote: "",
      ...(result.summary && { summary: result.summary }),
      ...usageIncrement(result.usage),
    },
  });
  if (count === 0) return false; // stopped while we were looking

  // Suggestions that were in this run's instructions are now handled
  if (task.startedAt) {
    await prisma.feedback.updateMany({
      where: { taskId, addressedAt: null, createdAt: { lte: task.startedAt } },
      data: { addressedAt: new Date() },
    });
  }

  if (result.memories.length > 0) {
    for (const mem of result.memories.slice(0, MAX_MEMORIES_PER_RUN)) {
      const key = mem.key.trim().slice(0, 200);
      const value = mem.value.trim().slice(0, 2000);
      if (!key || !value) continue;
      await prisma.memory.upsert({
        where: { boardId_key: { boardId: task.boardId, key } },
        update: { value, source: "agent", sourceTaskId: taskId },
        create: { boardId: task.boardId, key, value, source: "agent", sourceTaskId: taskId },
      });
    }
    emitEvent({ type: "memory:updated", boardId: task.boardId });
  }

  emitEvent({ type: "task:updated", taskId });
  emitEvent({ type: "runners:updated" });
  fireIntegrations(`task:${finalStatus}`, {
    id: task.id,
    title: task.title,
    status: finalStatus,
    boardId: task.boardId,
    runner: task.runnerName,
    ...(result.prUrl && { prUrl: result.prUrl }),
  }).catch(() => {});

  return true;
}

/**
 * End the current attempt as failed: re-queue it if retries remain,
 * otherwise mark it failed.
 */
async function failActiveRun(
  where: { id: string; runId: string; runnerId?: string },
  error: string,
  usage?: RunUsage,
  checkpoint?: Checkpoint
): Promise<boolean> {
  const task = await prisma.task.findFirst({ where: { ...where, status: "in_progress" } });
  if (!task) return false;

  const willRetry = task.retryCount < task.maxRetries;
  const { count } = await prisma.task.updateMany({
    where: { id: task.id, runId: task.runId, status: "in_progress" },
    data: {
      status: willRetry ? "ready" : "failed",
      error,
      heartbeatAt: null,
      ...(willRetry && { retryCount: { increment: 1 } }),
      ...usageIncrement(usage),
      // Without a new checkpoint, any earlier one stays for the next attempt
      // A non-empty note is what marks an out-of-turns checkpoint (vs. a send-back)
      ...(checkpoint && {
        resumeNote: checkpoint.note.trim() || "(The previous attempt didn't leave a message.)",
        ...(checkpoint.branchName && {
          resumeBranch: checkpoint.branchName,
          branchName: checkpoint.branchName,
          diff: checkpoint.diff.slice(0, MAX_DIFF_CHARS),
        }),
      }),
    },
  });
  if (count === 0) return false;

  if (checkpoint?.branchName) {
    await writeSystemLog(
      task.id,
      `Progress saved to ${checkpoint.branchName}. The next attempt continues from there.`
    );
  }

  await writeSystemLog(
    task.id,
    willRetry
      ? `Attempt failed: ${error}. Re-queued (retry ${task.retryCount + 1}/${task.maxRetries}).`
      : `Task failed: ${error}`
  );
  emitEvent({ type: "task:updated", taskId: task.id });
  emitEvent({ type: "runners:updated" });

  if (!willRetry) {
    fireIntegrations("task:failed", {
      id: task.id,
      title: task.title,
      status: "failed",
      boardId: task.boardId,
      runner: task.runnerName,
      error,
    }).catch(() => {});
  }
  return true;
}

export function failRun(
  runner: Runner,
  taskId: string,
  runId: string,
  error: string,
  usage?: RunUsage,
  checkpoint?: Checkpoint
): Promise<boolean> {
  return failActiveRun({ id: taskId, runId, runnerId: runner.id }, error, usage, checkpoint);
}

/** Fail every run a runner currently holds (used when its token is revoked) */
export async function failRunsForRunner(runnerId: string, error: string) {
  const tasks = await prisma.task.findMany({
    where: { runnerId, status: "in_progress" },
    select: { id: true, runId: true },
  });
  for (const task of tasks) {
    await failActiveRun(task, error);
  }
}

/** Re-queue runs whose runner stopped sending heartbeats */
export async function reapStaleRuns() {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);
  const stale = await prisma.task.findMany({
    where: {
      status: "in_progress",
      OR: [{ heartbeatAt: { lt: cutoff } }, { heartbeatAt: null }],
    },
    select: { id: true, runId: true, runnerName: true },
  });
  for (const task of stale) {
    await failActiveRun(
      { id: task.id, runId: task.runId },
      `Lost contact with ${task.runnerName || "the runner"} (no heartbeat for ${HEARTBEAT_TIMEOUT_MS / 1000}s)`
    );
  }
}

/**
 * Send a worked-on task back to the queue so an agent handles its pending suggestions.
 * A task in Review keeps building on its branch (updating the open PR); a merged or
 * failed task starts from the base branch.
 */
export async function requestChanges(
  taskId: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found", status: 404 };
  if (task.status === "in_progress") {
    return { ok: false, error: "An agent is already working on this task", status: 400 };
  }

  const pending = await prisma.feedback.count({ where: { taskId, addressedAt: null } });
  if (pending === 0) {
    return { ok: false, error: "Add a suggestion first", status: 400 };
  }

  const { count } = await prisma.task.updateMany({
    where: { id: taskId, status: { not: "in_progress" } },
    data: {
      status: "ready",
      error: null,
      retryCount: 0,
      completedAt: null,
      ...(task.status === "review" && task.branchName && { resumeBranch: task.branchName }),
    },
  });
  if (count === 0) {
    return { ok: false, error: "An agent is already working on this task", status: 400 };
  }

  await writeSystemLog(
    taskId,
    `Sent back to the agents with ${pending} suggestion${pending === 1 ? "" : "s"}`
  );
  emitEvent({ type: "task:updated", taskId });
  return { ok: true };
}

/** Stop a running task from the UI; the runner kills the agent on its next heartbeat */
export async function stopTask(taskId: string): Promise<boolean> {
  const { count } = await prisma.task.updateMany({
    where: { id: taskId, status: "in_progress" },
    data: { status: "failed", error: "Manually stopped", heartbeatAt: null },
  });
  if (count === 0) return false;
  await writeSystemLog(taskId, "Stop requested. The runner will kill the agent within a few seconds.");
  emitEvent({ type: "task:updated", taskId });
  emitEvent({ type: "runners:updated" });
  return true;
}
