import http from "node:http";
import https from "node:https";

/**
 * HTTP agent configuration to prevent "socket hang up" errors from keep-alive race conditions.
 *
 * The freeSocketTimeout (4s) must be shorter than the server's idle timeout to ensure
 * we close connections before the server does, preventing half-open connection issues.
 */
const agentOptions: http.AgentOptions = {
  keepAlive: true,
  keepAliveMsecs: 1000, // TCP keep-alive probe interval
  maxSockets: 100, // Max concurrent connections per host
  maxFreeSockets: 10, // Max idle connections to keep
  timeout: 30000, // Socket timeout (30s)
  scheduling: "fifo", // Use first-in-first-out for better connection reuse
};

// Node 18+ supports freeSocketTimeout to close idle sockets before server does
const httpAgentOptions = {
  ...agentOptions,
  freeSocketTimeout: 4000, // Close idle sockets after 4s (before server's typical 5-75s)
};

export const httpAgent = new http.Agent(httpAgentOptions);
export const httpsAgent = new https.Agent(httpAgentOptions);

/**
 * Returns the appropriate agent based on URL protocol
 */
export function getAgent(url: string): http.Agent | https.Agent {
  return url.startsWith("https://") ? httpsAgent : httpAgent;
}
