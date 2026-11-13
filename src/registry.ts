import Pipeline from "./pipeline.js";
import Platform from "./platform.js";

interface ActivePipeline {
  request: Pipeline;
  platform: Platform;
  controller: AbortController;
  terminalHookClaimed: boolean;
}

interface InterruptedPipeline {
  pipeline: ActivePipeline;
  shouldNotifyRetry: boolean;
}

const activePipelines: Map<string, ActivePipeline> = new Map();

export function register(
  id: string,
  request: Pipeline,
  platform: Platform,
  controller: AbortController = new AbortController(),
): ActivePipeline {
  const pipeline = { request, platform, controller, terminalHookClaimed: false };
  activePipelines.set(id, pipeline);
  return pipeline;
}

export function abort(id: string): ActivePipeline | undefined {
  const pipeline = activePipelines.get(id);
  pipeline?.controller.abort();
  return pipeline;
}

/** Claim the pipeline's single terminal hook before starting it. */
export function claimTerminalHook(id: string): boolean {
  const pipeline = activePipelines.get(id);
  if (!pipeline || pipeline.terminalHookClaimed) {
    return false;
  }
  pipeline.terminalHookClaimed = true;
  return true;
}

/**
 * Remove and abort a pipeline while atomically claiming its terminal hook.
 * The caller only emits retry when shouldNotifyRetry is true.
 */
export function interrupt(id: string): InterruptedPipeline | undefined {
  const pipeline = activePipelines.get(id);
  if (!pipeline) {
    return undefined;
  }
  activePipelines.delete(id);
  const shouldNotifyRetry = !pipeline.terminalHookClaimed;
  pipeline.terminalHookClaimed = true;
  pipeline.controller.abort();
  return { pipeline, shouldNotifyRetry };
}

export function unregister(id: string): void {
  activePipelines.delete(id);
}

export function getAll(): Map<string, ActivePipeline> {
  return activePipelines;
}

export default { register, abort, claimTerminalHook, interrupt, unregister, getAll };
