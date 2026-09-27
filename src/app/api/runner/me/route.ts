import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/runner-auth";

/** Lets a runner check its token on startup */
export async function GET(request: Request) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { runner } = auth;
  return NextResponse.json({ id: runner.id, name: runner.name, owner: runner.owner });
}
