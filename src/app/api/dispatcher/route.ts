import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isQueuePaused, setSetting } from "@/lib/settings";
import { RUNNER_ONLINE_WINDOW_MS } from "@/lib/runner-auth";
import { canMergeOnGitHub } from "@/lib/github";
import { emitEvent } from "@/lib/event-emitter";
import { getAuthMode } from "@/lib/auth";

/** Queue status: whether runners are being handed tasks, and how many are connected */
export async function GET() {
  const [paused, onlineRunners, activeTasks] = await Promise.all([
    isQueuePaused(),
    // Agents that are connected and not waiting out a usage limit
    prisma.runner.count({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - RUNNER_ONLINE_WINDOW_MS) },
        OR: [{ pausedUntil: null }, { pausedUntil: { lt: new Date() } }],
      },
    }),
    prisma.task.count({ where: { status: "in_progress" } }),
  ]);

  return NextResponse.json({
    running: !paused,
    onlineRunners,
    activeTasks,
    canMergePrs: canMergeOnGitHub(),
    authEnabled: getAuthMode() === "password",
  });
}

/** Pause ("stop") or resume ("start") handing out tasks. Running tasks continue. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action !== "start" && body.action !== "stop") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const running = body.action === "start";
  await setSetting("queuePaused", running ? "false" : "true");
  emitEvent({ type: "dispatcher:status", running });
  return NextResponse.json({ success: true, running });
}
