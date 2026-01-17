/**
 * Type augmentation for max-api module.
 * The @types/max-api package has incomplete types for ES module usage.
 */

declare module "max-api" {
  /** Log Levels used in maxAPI.post */
  enum POST_LEVELS {
    ERROR = "error",
    INFO = "info",
    WARN = "warn",
  }

  /** Predefined generic MaxFunctionSelector types */
  enum MESSAGE_TYPES {
    ALL = "all",
    BANG = "bang",
    DICT = "dict",
    NUMBER = "number",
    LIST = "list",
  }

  type MaxFunctionSelector = MESSAGE_TYPES | string;
  type MaxFunctionHandler = (...args: unknown[]) => unknown;
  type Anything = string | number | Array<string | number> | object;

  /** Register a single handler */
  function addHandler(
    selector: MaxFunctionSelector,
    handler: MaxFunctionHandler,
  ): void;

  /** Register handlers */
  function addHandlers(
    handlers: Record<MaxFunctionSelector, MaxFunctionHandler>,
  ): void;

  /** Remove a single handler */
  function removeHandler(
    selector: MaxFunctionSelector,
    handler: MaxFunctionHandler,
  ): void;

  /** Remove handlers */
  function removeHandlers(selector: MaxFunctionSelector): void;

  /** Outlet any values */
  function outlet(...args: unknown[]): Promise<void>;

  /** Outlet a Bang */
  function outletBang(): Promise<void>;

  /** Post to the Max console */
  function post(...args: Array<Anything | POST_LEVELS>): Promise<void>;

  /** Get the value of a dict object */
  function getDict(id: string): Promise<object>;

  /** Set the value of a dict object */
  function setDict(id: string, dict: object): Promise<object>;

  /** Partially update the value of a dict object at a given path */
  function updateDict(
    id: string,
    updatePath: string,
    updateValue: unknown,
  ): Promise<object>;
}
