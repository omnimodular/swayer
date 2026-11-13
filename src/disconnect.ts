import Event from "./events.js";
import registry from "./registry.js";

/**
 * Handle client disconnection during pipeline execution.
 * This is called when the HTTP client (e.g., a queue consumer) disconnects
 * before the pipeline completes, similar to SIGTERM handling.
 *
 * @param pipelineId - The ID of the pipeline that was interrupted
 */
export async function handleDisconnect(pipelineId: string): Promise<void> {
  console.warn(`Client disconnected during pipeline ${pipelineId}`);

  const interrupted = registry.interrupt(pipelineId);
  if (interrupted) {
    const { request, platform } = interrupted.pipeline;
    if (interrupted.shouldNotifyRetry && request.events?.retry) {
      console.warn(`Calling retry hook for disconnected pipeline ${pipelineId}`);
      await Event.retry(request, platform);
    }
  }
}

export default { handleDisconnect };
