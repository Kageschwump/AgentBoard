import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event-emitter";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "failed") {
    return NextResponse.json(
      { error: "Only failed tasks can be retried" },
      { status: 400 }
    );
  }

  const updated = await prisma.task.update({
    where: { id },
    data: {
      status: "todo",
      error: null,
      retryCount: { increment: 1 },
    },
  });

  emitEvent({ type: "task:updated", taskId: id });
  return NextResponse.json(updated);
}
