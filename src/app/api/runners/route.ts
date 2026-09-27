import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/db";
import { generateRunnerToken, hashRunnerToken } from "@/lib/auth";
import { isRunnerOnline } from "@/lib/runner-auth";
import { emitEvent } from "@/lib/event-emitter";
import { getLatestRunnerVersion } from "@/lib/runner-version";

const createRunnerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  owner: z.string().trim().max(60).optional().default(""),
});

export async function GET() {
  const latestVersion = await getLatestRunnerVersion();
  const runners = await prisma.runner.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      tasks: {
        where: { status: "in_progress" },
        select: { id: true, title: true },
      },
    },
  });

  return NextResponse.json(
    runners.map((runner) => ({
      id: runner.id,
      name: runner.name,
      owner: runner.owner,
      tokenPrefix: runner.tokenPrefix,
      lastSeenAt: runner.lastSeenAt,
      version: runner.version,
      platform: runner.platform,
      concurrency: runner.concurrency,
      createdAt: runner.createdAt,
      online: isRunnerOnline(runner.lastSeenAt),
      outdated: !!runner.version && !!latestVersion && runner.version !== latestVersion,
      activeTasks: runner.tasks,
    }))
  );
}

/** Create a runner and return its token. The token is shown only once. */
export async function POST(request: Request) {
  const parsed = createRunnerSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid runner" },
      { status: 400 }
    );
  }

  const token = generateRunnerToken();
  const runner = await prisma.runner.create({
    data: {
      name: parsed.data.name,
      owner: parsed.data.owner,
      tokenHash: hashRunnerToken(token),
      tokenPrefix: token.slice(0, 8),
    },
  });

  emitEvent({ type: "runners:updated" });
  return NextResponse.json(
    { id: runner.id, name: runner.name, owner: runner.owner, token },
    { status: 201 }
  );
}
