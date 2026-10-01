import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { authenticateRunner } from "@/lib/runner-auth";
import { completeRun } from "@/lib/task-queue";
import { usageSchema } from "@/lib/runner-schemas";

const completeSchema = z.object({
  runId: z.string().min(1),
  usage: usageSchema,
  branchName: z.string().max(250).optional().default(""),
  prUrl: z.string().max(500).optional().default(""),
  pushed: z.boolean().optional().default(false),
  diff: z.string().optional().default(""),
  summary: z.string().max(20_000).optional().default(""),
  memories: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .max(50)
    .optional()
    .default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const parsed = completeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid completion report", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { runId, ...result } = parsed.data;

  const ok = await completeRun(auth.runner, id, runId, result);
  if (!ok) {
    return NextResponse.json({ error: "Run is no longer active" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
