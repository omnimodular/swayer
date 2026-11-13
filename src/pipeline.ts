import { UUID } from "crypto";

export type PipelineHeaders = Record<string, string>;

export function getHeader(headers: PipelineHeaders, header: string): string | undefined {
  header = header.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === header) {
      return headers[key];
    }
  }
}

export function setHeader(headers: PipelineHeaders, header: string, value: string): void {
  const lowerHeader = header.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerHeader) {
      headers[key] = value;
      return;
    }
  }
  headers[header] = value;
}

export function deleteHeader(headers: PipelineHeaders, header: string): void {
  const lowerHeader = header.toLowerCase();
  for (const key in headers) {
    if (key.toLowerCase() === lowerHeader) {
      delete headers[key];
      return;
    }
  }
}

export type CookiesList = string[] | boolean;

interface Method {
  name?: string;
  headers?: PipelineHeaders;
  body?: object | string;
}

export interface InternalMethod extends Method {
  method?: null;
  patch?: object[];
}

export type MethodType = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface EndpointMethod extends Method {
  method: MethodType;
  endpoint: string;
  cookies?: CookiesList;
  passthrough?: string[];
  response?: {
    duration: number;
    status: number;
  };
}

export type EventType = Omit<EndpointMethod, "name" | "response">;

export interface EventsType {
  precheck?: EventType;
  success?: EventType;
  retry?: EventType;
  failure?: EventType;
}

export interface HookError {
  event: "success" | "retry" | "failure";
  message: string;
}

type MultiEndpoint = InternalMethod | EndpointMethod;

interface Pipeline {
  id?: UUID | string;
  traceId?: string;
  version?: "v3";
  name: string;
  headers?: PipelineHeaders;
  passthrough?: string[];
  cookies?: CookiesList;
  status: number;
  message?: string;
  error?: object;
  hookError?: HookError;
  steps: MultiEndpoint[];
  events?: EventsType;
}

export function setStatus(request: Pipeline, message: string, status: number, step?: string) {
  if (step === undefined) {
    request.message = message;
  } else {
    request.error = { message, step };
  }
  request.status = status;
  return request;
}

export default Pipeline;
