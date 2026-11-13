import { EndpointTimeoutError } from "./request-errors.js";
import ProcessorContext from "./context.js";
import { deleteHeader, EndpointMethod, getHeader, PipelineHeaders } from "./pipeline.js";
import Platform from "./platform.js";
import { PermanentDeliveryError } from "./delivery.js";

export function endpointTimeoutMs(): number {
  const value = Number(process.env.SWAYER_ENDPOINT_TIMEOUT_MS ?? "135000");
  if (!Number.isFinite(value) || value <= 0) {
    throw new PermanentDeliveryError("SWAYER_ENDPOINT_TIMEOUT_MS must be a positive number");
  }
  return value;
}

async function fetchOnce(
  step: EndpointMethod,
  headers: PipelineHeaders,
  context: ProcessorContext,
  platform: Platform,
  executionSignal?: AbortSignal,
) {
  const timeoutMs = endpointTimeoutMs();
  const controller = new AbortController();
  const abortExecution = () => controller.abort(executionSignal?.reason);
  if (executionSignal?.aborted) {
    abortExecution();
  } else {
    executionSignal?.addEventListener("abort", abortExecution, { once: true });
  }
  let deadlineExpired = false;
  const timeout = setTimeout(() => {
    deadlineExpired = true;
    controller.abort();
  }, timeoutMs);
  try {
    // One fetch per pipeline delivery is intentional. The queue redelivers an
    // unknown outcome; retrying here would multiply attempts across layers.
    return await platform.fetch(step.endpoint, {
      method: step.method,
      headers,
      body: context.input,
      agent: platform.getAgent?.(step.endpoint),
      signal: controller.signal,
    });
  } catch (error) {
    if (deadlineExpired && !executionSignal?.aborted) throw new EndpointTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    executionSignal?.removeEventListener("abort", abortExecution);
  }
}

export async function requestEndpointMethodWithContext(
  step: EndpointMethod,
  topHeaders: PipelineHeaders | undefined,
  context: ProcessorContext,
  platform: Platform,
  executionSignal?: AbortSignal,
) {
  const method = step.method?.toUpperCase();
  const bodyless = method === "GET" || method === "HEAD";
  const inherited: PipelineHeaders = { ...(context.headers ?? {}) };
  if (!bodyless && step.body !== undefined) {
    // The previous response's Content-Type describes its body, not this step's
    deleteHeader(inherited, "content-type");
  }
  const headers: PipelineHeaders = {};
  Object.assign(headers, inherited);
  if (topHeaders) {
    Object.assign(headers, topHeaders);
  }
  if (step.headers) {
    Object.assign(headers, step.headers);
  }
  // Content-Length describes the previous response on the wire, not this
  // request; fetch computes it from the actual body, if there is one.
  deleteHeader(headers, "content-length");
  if (bodyless) {
    context.input = undefined;
  } else if (typeof step.body === "object") {
    context.input = JSON.stringify(step.body);
    if (getHeader(headers, "content-type") === undefined) {
      headers["Content-Type"] = "application/json";
    }
  } else if (step.body) {
    context.input = `${step.body}`;
    if (getHeader(headers, "content-type") === undefined) {
      headers["Content-Type"] = "text/plain;charset=UTF-8";
    }
  }
  const res = await fetchOnce(step, headers, context, platform, executionSignal);
  if (!res.ok) {
    return res;
  }
  context.output = Buffer.from(await res.arrayBuffer());
  return res;
}
