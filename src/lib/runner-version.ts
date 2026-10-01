import { readFile } from "fs/promises";
import path from "path";

export const RUNNER_SCRIPT_PATH = path.join(process.cwd(), "runner", "agentboard-runner.mjs");

let cachedVersion: string | undefined;

/** Version of the runner script this board serves, read from its VERSION constant */
export async function getLatestRunnerVersion(): Promise<string> {
  if (cachedVersion === undefined) {
    try {
      const source = await readFile(RUNNER_SCRIPT_PATH, "utf-8");
      cachedVersion = source.match(/const VERSION = "([^"]+)"/)?.[1] ?? "";
    } catch {
      cachedVersion = "";
    }
  }
  return cachedVersion;
}
