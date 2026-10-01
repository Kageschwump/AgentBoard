import { getScheduler } from "./scheduler";
import { reapStaleRuns } from "./task-queue";
import { ensureDefaults } from "./ensure-defaults";

const REAP_INTERVAL = 15_000;

const globalForJobs = globalThis as unknown as {
  backgroundJobsStarted: boolean | undefined;
};

/** Start server-side background work. Called once from instrumentation. */
export async function startBackgroundJobs() {
  if (globalForJobs.backgroundJobsStarted) return;
  globalForJobs.backgroundJobsStarted = true;

  try {
    await ensureDefaults();
  } catch (err) {
    console.error("[agentboard] Failed to seed defaults:", err);
  }

  getScheduler().start();

  setInterval(() => {
    reapStaleRuns().catch((err) =>
      console.error("[agentboard] Failed to reap stale runs:", err)
    );
  }, REAP_INTERVAL);
}
