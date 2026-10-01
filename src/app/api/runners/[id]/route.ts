import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event-emitter";
import { failRunsForRunner } from "@/lib/task-queue";

/** Revoke a runner: its token stops working and its running tasks are re-queued */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runner = await prisma.runner.findUnique({ where: { id } });
  if (!runner) {
    return NextResponse.json({ error: "Runner not found" }, { status: 404 });
  }

  await failRunsForRunner(id, `Runner ${runner.name} was disconnected from the board`);
  await prisma.runner.delete({ where: { id } });

  emitEvent({ type: "runners:updated" });
  return NextResponse.json({ success: true });
}
