import { NextResponse } from "next/server";
import { prisma } from "./db";
import { hashRunnerToken } from "./auth";
import { emitEvent } from "./event-emitter";
import type { Runner } from "@/generated/prisma/client";

/** A runner counts as online if it has talked to us within this window */
export const RUNNER_ONLINE_WINDOW_MS = 30_000;
const LAST_SEEN_THROTTLE_MS = 5_000;

export function isRunnerOnline(lastSeenAt: Date | null): boolean {
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < RUNNER_ONLINE_WINDOW_MS;
}

/**
 * Authenticate a runner request by its bearer token.
 * Returns the runner, or a 401 response to send back.
 */
export async function authenticateRunner(
  request: Request
): Promise<{ runner: Runner } | { response: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const runner = token
    ? await prisma.runner.findUnique({ where: { tokenHash: hashRunnerToken(token) } })
    : null;

  if (!runner) {
    return {
      response: NextResponse.json(
        { error: "Invalid or revoked runner token" },
        { status: 401 }
      ),
    };
  }

  // Any authenticated request counts as a sign of life
  const now = new Date();
  const sinceLastSeen = runner.lastSeenAt ? now.getTime() - runner.lastSeenAt.getTime() : Infinity;
  if (sinceLastSeen > LAST_SEEN_THROTTLE_MS) {
    await prisma.runner.update({ where: { id: runner.id }, data: { lastSeenAt: now } });
    runner.lastSeenAt = now;
    if (sinceLastSeen > RUNNER_ONLINE_WINDOW_MS) {
      emitEvent({ type: "runners:updated" }); // came online
    }
  }

  return { runner };
}
