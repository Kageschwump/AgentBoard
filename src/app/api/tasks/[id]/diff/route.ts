import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** The diff the runner uploaded when the task finished */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    select: { diff: true },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ diff: task.diff || "(no changes detected)" });
}
