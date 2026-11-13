import { httpFailure, requestFailure } from "./request-errors.js";
import ProcessorContext from "./context.js";
import Pipeline, { EventType, PipelineHeaders } from "./pipeline.js";
import Platform from "./platform.js";
import { requestEndpointMethodWithContext } from "./request.js";
import { isRetryableHttpStatus, PermanentDeliveryError } from "./delivery.js";

namespace Event {
  function sanitizeEndpointInMessage(message: string): string {
    return message.replace(/endpoint\s+(<invalid endpoint>|\S+)/g, (_match, endpoint: string) => {
      try {
        const url = new URL(endpoint);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return `endpoint ${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
      } catch {
        return "endpoint <invalid endpoint>";
      }
    });
  }

  function failureEventFor(request: Pipeline, event: EventType | undefined): EventType | undefined {
    if (!event || !event.body || typeof event.body !== "object" || Array.isArray(event.body)) {
      return event;
    }
    if ("failureReason" in event.body) {
      return event;
    }
    const message =
      request.error && typeof request.error === "object" && "message" in request.error
        ? String((request.error as { message: unknown }).message)
        : request.message;
    if (!message) {
      return event;
    }
    const failureReason = sanitizeEndpointInMessage(message);
    return {
      ...event,
      body: {
        ...event.body,
        failureReason,
      },
    };
  }

  function recordHookFailure(request: Pipeline, event: "success" | "retry" | "failure", message: string): void {
    request.status = 503;
    request.hookError = { event, message };
    if (!request.error && !request.message) {
      request.message = message;
    }
  }

  async function requestEvent(
    event: EventType | undefined,
    headers: PipelineHeaders | undefined,
    platform: Platform,
    executionSignal?: AbortSignal,
  ) {
    if (event) {
      try {
        return await requestEndpointMethodWithContext(
          event,
          headers,
          { input: event.body } as ProcessorContext,
          platform,
          executionSignal,
        );
      } catch (error) {
        const message = requestFailure(event, error);
        // Preserve retry classification without retaining raw exception text in a stack.
        if (error instanceof TypeError) throw new TypeError(message);
        if (error instanceof PermanentDeliveryError) throw new PermanentDeliveryError(message);
        throw new Error(message);
      }
    } else {
      return null;
    }
  }

  export async function precheck(request: Pipeline, platform: Platform, executionSignal?: AbortSignal) {
    const event = request.events?.precheck;
    if (!event) {
      return true;
    }
    const res = await requestEvent(event, request.headers, platform, executionSignal);
    if (!res) {
      return true;
    }
    if (res.status === 404) {
      platform.log(`Pipeline ${request.name} job removed after HTTP 404 precheck`);
      return false;
    }
    if (isRetryableHttpStatus(res.status)) {
      throw new Error(httpFailure(event, res.status));
    }
    platform.log(`Pipeline ${request.name} precheck passed HTTP ${res.status}`);
    return true;
  }

  export async function success(request: Pipeline, platform: Platform, executionSignal?: AbortSignal) {
    try {
      const res = await requestEvent(request.events?.success, request.headers, platform, executionSignal);
      if (res && !res.ok) {
        recordHookFailure(request, "success", httpFailure(request.events!.success!, res.status));
      }
    } catch (err: any) {
      platform.warn(err instanceof Error ? err.message : "Callback request failed");
      if (err instanceof Error) {
        recordHookFailure(request, "success", err.message);
      }
    }
  }

  export async function failure(request: Pipeline, platform: Platform, executionSignal?: AbortSignal) {
    try {
      const res = await requestEvent(failureEventFor(request, request.events?.failure), request.headers, platform, executionSignal);
      if (res && !res.ok) {
        recordHookFailure(request, "failure", httpFailure(request.events!.failure!, res.status));
      }
    } catch (err: any) {
      platform.warn(err instanceof Error ? err.message : "Callback request failed");
      if (err instanceof Error) {
        recordHookFailure(request, "failure", err.message);
      }
    }
  }

  export async function retry(request: Pipeline, platform: Platform, executionSignal?: AbortSignal) {
    try {
      const res = await requestEvent(failureEventFor(request, request.events?.retry), request.headers, platform, executionSignal);
      if (res && !res.ok) {
        recordHookFailure(request, "retry", httpFailure(request.events!.retry!, res.status));
      }
    } catch (err: any) {
      platform.warn(err instanceof Error ? err.message : "Callback request failed");
      if (err instanceof Error) {
        recordHookFailure(request, "retry", err.message);
      }
    }
  }
}

export default Event;
