import { defineParameterType } from "@cucumber/cucumber";

defineParameterType({
  name: "json",
  regexp: [/["']((\[[^\}]{3,})?\{s*[^\}\{]{3,}?:.*\}([^\{]+\])?)["']/, /["'](\[.*?\])["']/],
  transformer: (...vars: (string | undefined)[]) => {
    const s = vars.find((a: string | undefined) => typeof a === "string");
    return s ? JSON.parse(s) : false;
  },
});
