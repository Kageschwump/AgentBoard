import { NextResponse } from "next/server";
import { requestChanges } from "@/lib/task-queue";

/** Send the task back to Ready so an agent addresses its pending suggestions */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await requestChanges(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
