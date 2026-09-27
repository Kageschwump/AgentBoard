import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaults } from "@/lib/ensure-defaults";
import { z } from "zod/v4";

const createBoardSchema = z.object({
  name: z.string().min(1, "Board name is required"),
  description: z.string().optional().default(""),
  repoUrl: z.string().trim().optional().default(""),
  baseBranch: z.string().optional().default("main"),
  gitProvider: z.string().optional().default(""),
  maxTurns: z.number().int().min(0).max(1000).optional().default(0),
});

export async function GET() {
  await ensureDefaults();
  const boards = await prisma.board.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(boards);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createBoardSchema.parse(body);

    const board = await prisma.board.create({ data });
    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", issues: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create board" },
      { status: 500 }
    );
  }
}
