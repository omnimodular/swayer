import fs from "fs";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function log(...objects: any[]): void {
  function replacer(name: string, val: any): any {
    if (name == "body" && val.type == "Buffer" && Array.isArray(val.data)) {
      return { type: val.type, length: val.data.length };
    }
    return val;
  }
  //const options = {
  //  breakLength: Infinity,
  //  colors: false,
  //}
  //console.log(util.inspect(obj, options))
  console.log(
    objects
      .map((obj) => {
        if (typeof obj == "object") {
          return JSON.stringify(obj, replacer);
        } else {
          return obj;
        }
      })
      .join(" "),
  );
}

export function mkdir(path: fs.PathLike): Promise<void> {
  return new Promise((resolve: () => void, reject: (reason: any) => void) => {
    fs.mkdir(path, (err) => {
      if (err) {
        if (err.code == "EEXIST") {
          resolve();
        } else {
          reject(err);
        }
      } else {
        resolve();
      }
    });
  });
}

export function filenameWithExt(basename: string, contentType: string | null = null): string {
  // contentType can be 'application/json; charset=utf-8'
  if (contentType == null) {
    return basename;
  }
  const extMap: { [key: string]: string } = {
    "text/plain": ".txt",
    "text/csv": ".csv",
    "text/css": ".css",
    "application/json": ".json",
    "application/pdf": ".pdf",
  };
  const ext = extMap[contentType.split(";")[0]];
  if (ext) {
    return `${basename}${ext}`;
  } else {
    return basename;
  }
}
