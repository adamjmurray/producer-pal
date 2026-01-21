/**
 * Type declarations for max-api module (Node for Max).
 * Replaces @types/max-api with complete, accurate definitions.
 * Reference: https://docs.cycling74.com/nodeformax/api/
 */

declare module "max-api" {
  /** Environment values set on process.env.MAX_ENV */
  enum MAX_ENV {
    MAX = "max",
    LIVE = "live",
    STANDALONE = "standalone",
  }

  /** Log levels for maxAPI.post() */
  enum POST_LEVELS {
    ERROR = "error",
    INFO = "info",
    WARN = "warn",
  }

  /** Predefined message types for handlers */
  enum MESSAGE_TYPES {
    ALL = "all",
    BANG = "bang",
    DICT = "dict",
    NUMBER = "number",
    LIST = "list",
  }

  // JSON types for dict operations
  type JSONPrimitive = string | number | boolean | null;
  type JSONArray = JSONValue[];
  type JSONObject = { [key: string]: JSONValue };
  type JSONValue = JSONPrimitive | JSONArray | JSONObject;

  // Max-specific types
  type MaxFunctionSelector = MESSAGE_TYPES | string;
  type MaxFunctionHandler = (...args: unknown[]) => unknown;
  type Anything = string | number | Array<string | number> | JSONObject;

  /** Register a single handler */
  function addHandler(
    selector: MaxFunctionSelector,
    handler: MaxFunctionHandler,
  ): void;

  /** Register multiple handlers */
  function addHandlers(
    handlers: Record<MaxFunctionSelector, MaxFunctionHandler>,
  ): void;

  /** Remove a single handler */
  function removeHandler(
    selector: MaxFunctionSelector,
    handler: MaxFunctionHandler,
  ): void;

  /** Remove all handlers for a selector (or all if no selector) */
  function removeHandlers(selector?: MaxFunctionSelector): void;

  /** Send values to outlet */
  function outlet(...args: unknown[]): Promise<void>;

  /** Send a bang to outlet */
  function outletBang(): Promise<void>;

  /** Post to Max console (last arg can be POST_LEVELS) */
  function post(...args: Array<Anything | POST_LEVELS>): Promise<void>;

  /** Get contents of a named dict */
  function getDict(id: string): Promise<JSONObject>;

  /** Set entire contents of a named dict */
  function setDict(id: string, dict: JSONObject): Promise<JSONObject>;

  /** Update a dict at a specific path */
  function updateDict(
    id: string,
    updatePath: string,
    updateValue: JSONValue,
  ): Promise<JSONObject>;
}
