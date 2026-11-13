/** HTTP outcomes that leave a pipeline invocation without a definitive result. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export class PermanentDeliveryError extends Error {}

/** Unknown execution failures stay retryable unless they are known request/configuration errors. */
export function isRetryableDeliveryError(error: unknown): boolean {
  return !(error instanceof TypeError || error instanceof PermanentDeliveryError);
}
