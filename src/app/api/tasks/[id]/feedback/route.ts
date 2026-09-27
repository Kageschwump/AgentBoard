import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event-emitter";

const createFeedbackSchema = z.object({
  content: z.string().trim().min(1, "Write a suggestion first").max(4000),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feedback = await prisma.feedback.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(feedback);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = createFeedbackSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid suggestion" },
      { status: 400 }
    );
  }

  const task = await prisma.task.count({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const feedback = await prisma.feedback.create({
    data: { taskId: id, content: parsed.data.content },
  });
  emitEvent({ type: "task:updated", taskId: id });
  return NextResponse.json(feedback, { status: 201 });
}
