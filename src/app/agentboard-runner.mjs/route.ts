import { readFile } from "fs/promises";
import path from "path";

/** Serve the runner script so friends can download it straight from the board */
export async function GET() {
  const script = await readFile(
    path.join(process.cwd(), "runner", "agentboard-runner.mjs"),
    "utf-8"
  );
  return new Response(script, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agentboard-runner.mjs"',
      "Cache-Control": "no-cache",
    },
  });
}
