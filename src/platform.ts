import fetch from "node-fetch";
import http from "node:http";
import https from "node:https";

export default interface Platform {
  fetch: typeof fetch;
  log: typeof console.log;
  logs: (...obj: any[]) => void;
  trace: typeof console.trace;
  warn: typeof console.warn;
  error: typeof console.error;
  getAgent?: (url: string) => http.Agent | https.Agent;
}
