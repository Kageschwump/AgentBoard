import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { authenticateRunner } from "@/lib/runner-auth";
import { recordHeartbeat } from "@/lib/task-queue";

const heartbeatSchema = z.object({ runId: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  return NextResponse.json(await recordHeartbeat(auth.runner, id, parsed.data.runId));
}
