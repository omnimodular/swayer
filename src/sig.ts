// Reduce error bloat

import Event from "./events.js";
import registry from "./registry.js";

let isShuttingDown = false;

process
  .on("SIGTERM", () => shutdown("SIGTERM"))
  .on("SIGINT", () => shutdown("SIGINT"))
  .on("uncaughtException", shutdown);

async function shutdown(err: any) {
  if (isShuttingDown) return; // Prevent multiple shutdown attempts
  isShuttingDown = true;

  console.log("Shutdown initiated");
  if (err && typeof err !== "string") console.error(err.stack || err);

  // A shutdown is an unknown outcome, not a definitive business failure.
  const activePipelineIds = [...registry.getAll().keys()];
  if (activePipelineIds.length > 0) {
    console.log(`Calling retry hooks for ${activePipelineIds.length} active pipeline(s)`);
    const promises: Promise<void>[] = [];
    for (const id of activePipelineIds) {
      const interrupted = registry.interrupt(id);
      if (!interrupted) continue;
      const { request, platform } = interrupted.pipeline;
      if (interrupted.shouldNotifyRetry && request.events?.retry) {
        console.log(`Calling retry hook for pipeline ${id}`);
        promises.push(Event.retry(request, platform));
      }
    }
    await Promise.allSettled(promises);
  }

  process.exit(err && typeof err !== "string" ? 1 : 0);
}

export function isTerminating(): boolean {
  return isShuttingDown;
}
