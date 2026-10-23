import { NextResponse } from "next/server";
import { authenticateRunner } from "@/lib/runner-auth";
import { getLatestRunnerVersion } from "@/lib/runner-version";

/** Lets a runner check its token (and whether it's up to date) on startup */
export async function GET(request: Request) {
  const auth = await authenticateRunner(request);
  if ("response" in auth) return auth.response;
  const { runner } = auth;
  return NextResponse.json({
    id: runner.id,
    name: runner.name,
    owner: runner.owner,
    latestRunnerVersion: await getLatestRunnerVersion(),
  });
}
