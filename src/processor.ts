import { httpFailure, requestFailure } from "./request-errors.js";
import jsonpatch, { OpPatch } from "json-patch";
import { Response } from "node-fetch";

import Platform from "./platform.js";
import Pipeline, {
  CookiesList,
  deleteHeader,
  EndpointMethod,
  InternalMethod,
  setHeader,
  setStatus,
} from "./pipeline.js";
import Event from "./events.js";
import ProcessorContext from "./context.js";
import { requestEndpointMethodWithContext } from "./request.js";
import { pipeline_count, pipeline_time } from "./metrics.js";
import { appendCookies, getCookieHeader } from "./cookie.js";
import registry from "./registry.js";
import { isRetryableDeliveryError, isRetryableHttpStatus } from "./delivery.js";

function internalMethod(step: InternalMethod, context: ProcessorContext, platform: Platform) {
  if (typeof step.body === "object") {
    context.output = JSON.stringify(step.body);
    setHeader(context.headers, "Content-Type", "application/json");
  } else if (typeof step.body === "string") {
    context.output = step.body;
  } else if (step.patch) {
    const input = JSON.parse(context.input?.toString() ?? "");
    try {
      context.output = jsonpatch.apply(input, step.patch as OpPatch[]);
    } catch (err: any) {
      if (err instanceof jsonpatch.PatchConflictError) {
        platform.log("Warning: JSON patch field out of bounds or does not exist:", err.message);
      } else {
        throw err;
      }
    }
    context.output = JSON.stringify(context.output);
  }
  if (Object.hasOwn(step, "headers")) {
    if (!step.headers) {
      deleteHeader(context.headers, "content-type");
    } else {
      for (const key in step.headers) {
        if (key.toLowerCase() === "content-type") {
          setHeader(context.headers, key, step.headers[key]);
        }
      }
    }
  }
}

function handleCookies(request: Pipeline, step: EndpointMethod, context: ProcessorContext) {
  let cookies: CookiesList = false;
  if (typeof step.cookies === "boolean") {
    cookies = step.cookies;
  } else if (typeof request.cookies === "boolean") {
    cookies = request.cookies;
  } else if (request.cookies || step.cookies) {
    cookies = [...(request.cookies || []), ...(step.cookies || [])];
  }
  const cookie = getCookieHeader(context.cookies, cookies);
  if (cookie) {
    setHeader(context.headers, "Cookie", cookie);
  }
}

export default async function processor(request: Pipeline, platform: Platform): Promise<Pipeline> {
  // 0: Init
  if (!request.name) {
    return setStatus(request, "'name' field is required", 400);
  }

  // Register an execution signal so disconnect/shutdown can stop further work.
  const controller = new AbortController();
  const pipelineId = request.id as string;
  registry.register(pipelineId, request, platform, controller);
  const { signal } = controller;
  const interrupted = () => setStatus(request, "Pipeline interrupted before completion", 503);

  try {
    const topHeaders = request.headers ?? {};
    const context = { headers: {}, cookies: {} } as ProcessorContext;
    const allowedHeaders = ["Content-Type"];
    if (Array.isArray(request.passthrough)) {
      allowedHeaders.push(...request.passthrough);
    }
    let tsum = 0;
    if (signal.aborted) {
      return interrupted();
    }
    // 1: Pre-check
    try {
      if (!(await Event.precheck(request, platform, signal))) {
        pipeline_count.labels(request.name, "skipped").inc();
        return setStatus(request, "Pipeline removed after failed precheck", 200);
      }
    } catch (err: any) {
      if (signal.aborted) {
        return interrupted();
      }
      pipeline_count.labels(request.name, "error").inc();
      platform.log(err.message);
      const status = isRetryableDeliveryError(err) ? 503 : 400;
      return setStatus(request, err.message, status);
    }
    // 2: Iterate
    const steps = request.steps;
    if (!steps) {
      return setStatus(request, "Missing 'steps' field", 400);
    }
    for (const index in steps) {
      if (signal.aborted) {
        return interrupted();
      }
      const step = steps[index];
      // 2.x: Error
      const createError = async (message: string, status: number = 400) => {
        pipeline_count.labels(request.name, "error").inc();
        setStatus(request, message, status, step.name || index);
        if (registry.claimTerminalHook(pipelineId)) {
          if (isRetryableHttpStatus(status)) {
            await Event.retry(request, platform, signal);
          } else {
            await Event.failure(request, platform, signal);
          }
        }
        return request;
      };
      context.input = context.output;
      context.output = undefined;
      if (!step.method) {
        // 2.1: Internal
        internalMethod(step, context, platform);
      } else if (typeof step.method === "string") {
        // 2.2: External
        const t0 = performance.now();
        let response: Response;
        try {
          response = await requestEndpointMethodWithContext(
            step,
            topHeaders,
            context,
            platform,
            signal,
          );
          if (signal.aborted) {
            return interrupted();
          }
          if (!response?.ok) {
            return await createError(httpFailure(step, response.status), response.status);
          }
        } catch (err: any) {
          if (signal.aborted) {
            return interrupted();
          }
          const message = requestFailure(step, err);
          platform.warn(message);
          const status = isRetryableDeliveryError(err) ? 503 : 400;
          return await createError(message, status);
        }
        const t1 = performance.now();
        const duration = Math.round(t1 - t0); // ms
        tsum += t1 - t0;
        const status = response.status;
        step.response = { duration, status };
        context.headers = {};
        const setCookieHeader = response.headers.get("set-cookie")?.split(",") ?? [];
        appendCookies(context.cookies, setCookieHeader);
        handleCookies(request, step, context);
        const transferHeader = (key: string) => {
          const value = response.headers.get(key);
          if (value) {
            setHeader(context.headers, key, value);
          }
        };
        allowedHeaders.forEach(transferHeader);
        step.passthrough?.forEach(transferHeader);
      } else {
        return await createError("Invalid method");
      }
    }
    // 3: Success
    if (signal.aborted) {
      return interrupted();
    }
    const duration = Math.round(tsum);
    pipeline_time.labels(request.name).inc(duration);
    request.status = 200;
    if (registry.claimTerminalHook(pipelineId)) {
      await Event.success(request, platform, signal);
    }
    pipeline_count.labels(request.name, 200 <= request.status && request.status < 300 ? "ok" : "error").inc();
    return request;
  } finally {
    // Unregister pipeline when done (success or error)
    registry.unregister(pipelineId);
  }
}
