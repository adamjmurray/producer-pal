// src/console.js
// enhance Max v8's basic console logging functions (`post()` and `error()`) to behave more like a browser console
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

    case Dict.prototype:
      return `Dict("${any.name}") ${any.stringify().replaceAll("\n", " ")}`;
  }
  const s = String(any);
  return s === "[object Object]"
    ? any.constructor.name + JSON.stringify(any)
    : s;
};

export const log = (...any) => post(...any.map(str), "\n");

export const error = (...any) => globalThis.error(...any.map(str), "\n");
