import type { EndpointMethod } from "./pipeline.js";
import { PermanentDeliveryError } from "./delivery.js";
import { sanitizeEndpoint } from "./observability.js";

export class EndpointTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super("Endpoint request deadline exceeded");
    this.name = "EndpointTimeoutError";
  }
}

function target(step: Pick<EndpointMethod, "method" | "endpoint">): string {
  return `${step.method ?? "GET"} endpoint ${sanitizeEndpoint(step.endpoint)}`;
}

export function httpFailure(step: EndpointMethod, status: number): string {
  return `${target(step)} returned HTTP ${status}`;
}

export function requestFailure(step: EndpointMethod, error: unknown): string {
  const prefix = target(step);
  if (error instanceof EndpointTimeoutError) return `${prefix} timed out after ${error.timeoutMs} ms`;
  const data = error as { code?: unknown; type?: unknown; name?: unknown } | null;
  const code = typeof data?.code === "string" ? data.code : "";
  const categories: Record<string, string> = {
    ENOTFOUND: "DNS lookup failed",
    EAI_AGAIN: "DNS lookup failed",
    ECONNREFUSED: "connection refused",
    ECONNRESET: "connection interrupted",
    EPIPE: "connection interrupted",
    ETIMEDOUT: "network timeout",
    ESOCKETTIMEDOUT: "network timeout",
    CERT_HAS_EXPIRED: "TLS error",
    DEPTH_ZERO_SELF_SIGNED_CERT: "TLS error",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS error",
    ERR_TLS_CERT_ALTNAME_INVALID: "TLS error",
    SELF_SIGNED_CERT_IN_CHAIN: "TLS error",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "TLS error",
    UNABLE_TO_GET_ISSUER_CERT: "TLS error",
    HOSTNAME_MISMATCH: "TLS error",
  };
  if (Object.hasOwn(categories, code)) return `${prefix} failed: ${categories[code]} (${code})`;
  // Recognize other TLS families without copying an unrecognized code into logs.
  if (/^(ERR_TLS_|ERR_SSL_|CERT_)/.test(code)) return `${prefix} failed: TLS error`;
  if (data?.name === "AbortError") return `${prefix} was aborted`;
  if (error instanceof TypeError || error instanceof PermanentDeliveryError)
    return `${prefix} failed: invalid request configuration`;
  return `${prefix} failed: ${data?.type === "system" ? "transport error" : "request execution error"}`;
}
