import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitEvent } from "@/lib/event-emitter";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; feedbackId: string }> }
) {
  const { id, feedbackId } = await params;
  const { count } = await prisma.feedback.deleteMany({
    where: { id: feedbackId, taskId: id },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
  }
  emitEvent({ type: "task:updated", taskId: id });
  return NextResponse.json({ success: true });
}
