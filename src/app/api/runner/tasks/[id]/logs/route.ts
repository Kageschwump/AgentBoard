import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { authenticateRunner } from "@/lib/runner-auth";
import { appendLogs } from "@/lib/task-queue";

const logsSchema = z.object({
  runId: z.string().min(1),
  logs: z
    .array(
      z.object({
        stream: z.enum(["stdout", "stderr", "system"]),
        content: z.string(),
      })
    )
    .max(1000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const parsed = logsSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid log batch" }, { status: 400 });
  }

  const ok = await appendLogs(auth.runner, id, parsed.data.runId, parsed.data.logs);
  if (!ok) {
    return NextResponse.json({ error: "Run is no longer active" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
