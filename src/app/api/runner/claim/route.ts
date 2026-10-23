import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/db";
import { authenticateRunner } from "@/lib/runner-auth";
import { claimTask } from "@/lib/task-queue";
import { emitEvent } from "@/lib/event-emitter";

const claimSchema = z.object({
  boardIds: z.array(z.string()).optional().default([]),
  concurrency: z.number().int().min(1).max(20).optional(),
  version: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
  // Set while the runner waits out a Claude usage limit: just check in, don't claim
  pausedUntil: z.iso.datetime().optional(),
});

/** Runner asks for work. 200 with a task, or 204 when there's nothing to do. */
export async function POST(request: Request) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { runner } = auth;

  const parsed = claimSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid claim request" }, { status: 400 });
  }
  const { boardIds, concurrency, version, platform } = parsed.data;
  const pausedUntil =
    parsed.data.pausedUntil && new Date(parsed.data.pausedUntil) > new Date()
      ? new Date(parsed.data.pausedUntil)
      : null;
  const pauseChanged = pausedUntil?.getTime() !== runner.pausedUntil?.getTime();

  if (
    pauseChanged ||
    (concurrency !== undefined && concurrency !== runner.concurrency) ||
    (version !== undefined && version !== runner.version) ||
    (platform !== undefined && platform !== runner.platform)
  ) {
    await prisma.runner.update({
      where: { id: runner.id },
      data: {
        pausedUntil,
        ...(concurrency !== undefined && { concurrency }),
        ...(version !== undefined && { version }),
        ...(platform !== undefined && { platform }),
      },
    });
    if (pauseChanged) emitEvent({ type: "runners:updated" });
  }

  if (pausedUntil) return new NextResponse(null, { status: 204 });

  const claim = await claimTask(runner, boardIds);
  if (!claim) return new NextResponse(null, { status: 204 });
  return NextResponse.json(claim);
}
