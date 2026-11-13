import Pipeline, { EndpointMethod, getHeader } from "./pipeline.js";

type PipelineError = {
  message?: string;
  step?: string;
};

export function shouldLogSuccess(): boolean {
  const value = process.env.SWAYER_LOG_SUCCESS?.toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function resolveTraceId(request: Pipeline): string | undefined {
  return request.traceId ?? getHeader(request.headers ?? {}, "x-om-trace-id") ?? request.id?.toString();
}

export function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "<invalid endpoint>";
  }
}

export function pipelineLogFields(request: Pipeline) {
  return {
    traceId: resolveTraceId(request),
    swayerJobId: request.id,
    pipelineName: request.name,
  };
}

function completedHttpSteps(request: Pipeline): EndpointMethod[] {
  return request.steps.filter((step): step is EndpointMethod => Boolean(step.method && step.response));
}

export function pipelineCompletedLog(request: Pipeline) {
  const steps = completedHttpSteps(request);
  const lastStep = steps.at(-1);
  const durationMs = steps.reduce((sum, step) => sum + (step.response?.duration ?? 0), 0);
  return {
    event: "swayer.pipeline.completed",
    level: "info",
    ...pipelineLogFields(request),
    status: request.status,
    httpStepCount: steps.length,
    durationMs,
    lastStepName: lastStep?.name,
    lastMethod: lastStep?.method,
    lastEndpoint: lastStep ? sanitizeEndpoint(lastStep.endpoint) : undefined,
    lastStatusCode: lastStep?.response?.status,
    lastDurationMs: lastStep?.response?.duration,
  };
}

export function pipelineFailureLog(request: Pipeline) {
  const error = request.error as PipelineError | undefined;
  return {
    event: "swayer.pipeline.failed",
    level: "warning",
    ...pipelineLogFields(request),
    status: request.status,
    message: error?.message ?? request.message,
    step: error?.step,
    hookError: request.hookError?.message,
    hookEvent: request.hookError?.event,
  };
}
