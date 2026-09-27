import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stopTask } from "@/lib/task-queue";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const stopped = await stopTask(id);
  if (!stopped) {
    const exists = await prisma.task.count({ where: { id } });
    return exists
      ? NextResponse.json({ error: "Task is not in progress" }, { status: 400 })
      : NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const updated = await prisma.task.findUnique({ where: { id } });
  return NextResponse.json(updated);
}
