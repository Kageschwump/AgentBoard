export async function register() {
  // Only in the running server, not in `next build` workers
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startBackgroundJobs } = await import("./lib/background");
    await startBackgroundJobs();
  }
}
