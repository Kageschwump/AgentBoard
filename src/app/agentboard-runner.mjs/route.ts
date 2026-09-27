import { readFile } from "fs/promises";
import { RUNNER_SCRIPT_PATH } from "@/lib/runner-version";

/** Serve the runner script so friends can download it straight from the board */
export async function GET() {
  const script = await readFile(RUNNER_SCRIPT_PATH, "utf-8");
  return new Response(script, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agentboard-runner.mjs"',
      "Cache-Control": "no-cache",
    },
  });
}
