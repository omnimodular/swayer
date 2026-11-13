import { defineParameterType } from "@cucumber/cucumber";

defineParameterType({
  name: "boolean",
  regexp: /(true|false)/,
  transformer: (bool: string) => {
    return bool.toLowerCase() === "true";
  },
});
