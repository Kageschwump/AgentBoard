import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const LOG_PAGE_SIZE = 500;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(request.url);
  // the id of the last log the client has; it gets the ones after it
  const cursor = url.searchParams.get("cursor");

  const logs = await prisma.taskLog.findMany({
    where: { taskId: id },
    // a runner's log batch is saved with one timestamp, so the id keeps the lines in order
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: LOG_PAGE_SIZE,
  });

  return NextResponse.json(logs);
}
