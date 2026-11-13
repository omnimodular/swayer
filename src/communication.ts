namespace API {
  type Headers = {
    [key: string]: string | string[] | undefined;
  };

  export interface Request {
    readonly headers: Headers;
    readonly body: object;
  }

  export interface Response {
    set(field: string, value: string): this;
    status(code: number): this;
    send(body: any): this;
    end(chunk: any): this;
  }
}

export default API;
