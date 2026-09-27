import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { authenticateRunner } from "@/lib/runner-auth";
import { failRun } from "@/lib/task-queue";
import { usageSchema } from "@/lib/runner-schemas";

const failSchema = z.object({
  runId: z.string().min(1),
  error: z.string().min(1).max(2000),
  usage: usageSchema.optional(),
  checkpoint: z
    .object({
      branchName: z.string().max(250).optional().default(""),
      note: z.string().max(4000).optional().default(""),
      diff: z.string().optional().default(""),
    })
    .optional(),
  // Not the task's fault (runner stopping, out of Claude usage): don't use up a retry
  requeue: z.boolean().optional().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const parsed = failSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid failure report" }, { status: 400 });
  }
  const { runId, error, usage, checkpoint, requeue } = parsed.data;

  const ok = await failRun(auth.runner, id, runId, {
    error,
    usage,
    checkpoint,
    countAsRetry: !requeue,
  });
  if (!ok) {
    return NextResponse.json({ error: "Run is no longer active" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
