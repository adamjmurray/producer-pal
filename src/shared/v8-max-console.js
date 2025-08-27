// Enhance Max v8's basic console logging functions (`post()` and `error()`) to behave more like a browser console
// Note: this is for Max v8 runtime only, meaning is can be used with src/live-api-adapter and src/tools code.
// There are dedicated logging solutions for the Claude Desktop Extension and MCP Server (Node for Max) code
// in the respective source code folders.
const str = (any) => {
  switch (Object.getPrototypeOf(any ?? Object.prototype)) {
    case Array.prototype:
      return `[${any.map(str).join(", ")}]`;

    case Set.prototype:
      return `Set(${[...any].map(str).join(", ")})`;

    case Object.prototype:
      return `{${Object.entries(any)
        .map(([k, v]) => `${str(k)}: ${str(v)}`)
        .join(", ")}}`;

    case Map.prototype:
      return `Map(${[...any.entries()].map(([k, v]) => `${str(k)} → ${str(v)}`).join(", ")})`;

    case typeof Dict !== "undefined" ? Dict.prototype : null:
      return `Dict("${any.name}") ${any.stringify().replaceAll("\n", " ")}`;
  }
  const s = String(any);
  return s === "[object Object]"
    ? any.constructor.name + JSON.stringify(any)
    : s;
};

export const log = (...any) => {
  if (typeof post === "function") {
    post(...any.map(str), "\n");
  } else {
    // Fallback for test environment
    console.log(...any.map(str));
  }
};

export const error = (...any) => {
  if (typeof globalThis.error === "function") {
    globalThis.error(...any.map(str), "\n");
  } else {
    // Fallback for test environment
    console.error(...any.map(str));
  }
};
