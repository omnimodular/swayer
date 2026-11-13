export type Cookies = Record<string, string>;

export function appendCookies(cookies: Cookies, newCookies: string[]) {
  // NOTE: We do not handle secure attributes for a cookie (i.e. Domain; Path; SameSite; Secure)
  // NOTE: Simple implementation, may want to pull in a better dependency
  for (const line of newCookies) {
    const cookie = line.split(";").at(0)?.trim();
    if (cookie) {
      const s = cookie.split("=", 2);
      if (s.length == 2) {
        cookies[s[0]] = s[1];
      }
    }
  }
}

export function getCookieHeader(cookies: Cookies, allowed: string[] | boolean) {
  const cookie = [];
  if (typeof allowed === "boolean") {
    if (allowed === true) {
      for (const [key, value] of Object.entries(cookies)) {
        cookie.push(`${key}=${value}`);
      }
    }
  } else {
    for (const allow of allowed) {
      if (allow in cookies) {
        cookie.push(`${allow}=${cookies[allow]}`);
      }
    }
  }
  return cookie.join("; ");
}
