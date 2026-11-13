import { Cookies } from "./cookie.js";
import { PipelineHeaders } from "./pipeline.js";

type Content = Buffer<ArrayBuffer> | string | undefined;

export default interface ProcessorContext {
  input: Content;
  output: Content;
  headers: PipelineHeaders;
  cookies: Cookies;
}
