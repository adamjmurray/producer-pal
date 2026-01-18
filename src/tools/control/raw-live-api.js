import { errorMessage } from "#src/shared/error-utils.js";

const MAX_OPERATIONS = 50;

const OPERATION_REQUIREMENTS = {
  get_property: { property: true },
  set_property: { property: true, valueDefined: true },
  call_method: { method: true },
  get: { property: true },
  set: { property: true, valueDefined: true },
  call: { method: true },
  goto: { valueTruthy: true },
  info: {},
  getProperty: { property: true },
  getChildIds: { property: true },
  exists: {},
  getColor: {},
  setColor: { valueTruthy: true },
};

const OPERATION_ERROR_MESSAGES = {
  get_property: { property: "get_property operation requires property" },
  set_property: {
    property: "set_property operation requires property",
    value: "set_property operation requires value",
  },
  call_method: { method: "call_method operation requires method" },
  get: { property: "get operation requires property" },
  set: {
    property: "set operation requires property",
    value: "set operation requires value",
  },
  call: { method: "call operation requires method" },
  goto: { value: "goto operation requires value (path)" },
  getProperty: { property: "getProperty operation requires property" },
  getChildIds: {
    property: "getChildIds operation requires property (child type)",
  },
  setColor: { value: "setColor operation requires value (color)" },
};

/**
 * @typedef {object} RawApiOperation
 * @property {string} type - The operation type
 * @property {string} [property] - Property name for property operations
 * @property {string} [method] - Method name for method operations
 * @property {*} [value] - Value for set/goto operations
 * @property {Array<*>} [args] - Arguments for call operations
 */

/**
 * Validates operation parameters based on operation type
 * @param {RawApiOperation} operation - The operation object
 * @throws {Error} If required parameters are missing
 */
function validateOperationParameters(operation) {
  const { type, property, method, value } = operation;

  if (!(type in OPERATION_REQUIREMENTS)) {
    throw new Error(
      `Unknown operation type: ${type}. Valid types: get_property, set_property, call_method, get, set, call, goto, info, getProperty, getChildIds, exists, getColor, setColor`,
    );
  }

  const requirements = OPERATION_REQUIREMENTS[type];
  const messages = OPERATION_ERROR_MESSAGES[type] || {};

  if (requirements.property && !property) {
    throw new Error(messages.property);
  }

  if (requirements.method && !method) {
    throw new Error(messages.method);
  }

  if (requirements.valueDefined && value === undefined) {
    throw new Error(messages.value);
  }

  if (requirements.valueTruthy && !value) {
    throw new Error(messages.value);
  }
}

/**
 * Executes a single operation on the LiveAPI instance
 * @param {LiveAPI} api - The LiveAPI instance
 * @param {RawApiOperation} operation - The operation to execute
 * @returns {*} The result of the operation
 */
function executeOperation(api, operation) {
  const { type } = operation;

  // Property and method are validated by validateOperationParameters
  const property = /** @type {string} */ (operation.property);
  const method = /** @type {string} */ (operation.method);

  switch (type) {
    case "get_property":
      return api[property];

    case "set_property":
      api.set(property, operation.value);

      return operation.value;

    case "call_method": {
      const args = operation.args || [];

      return api[method](...args);
    }

    case "get":
      return api.get(property);

    case "set":
      return api.set(property, operation.value);

    case "call": {
      const callArgs = operation.args || [];

      return api.call(method, ...callArgs);
    }

    case "goto":
      return api.goto(operation.value);

    case "info":
      return api.info;

    case "getProperty":
      return api.getProperty(property);

    case "getChildIds":
      return api.getChildIds(property);

    case "exists":
      return api.exists();

    case "getColor":
      return api.getColor();

    case "setColor":
      return api.setColor(operation.value);

    default:
      throw new Error(`Unknown operation type: ${type}`);
  }
}

/**
 * Provides direct, low-level access to the Live API for research, development, and debugging
 * @param {{ path?: string, operations: RawApiOperation[] }} args - The parameters
 * @param {Partial<ToolContext>} [_context] - Internal context object (unused)
 * @returns {{ path?: string, id: string, results: Array<{ operation: RawApiOperation, result: * }> }} Result object with path, id, and operation results
 */
export function rawLiveApi({ path, operations }, _context = {}) {
  if (!Array.isArray(operations)) {
    throw new Error("operations must be an array");
  }

  if (operations.length > MAX_OPERATIONS) {
    throw new Error(
      `operations array cannot exceed ${MAX_OPERATIONS} operations`,
    );
  }

  const defaultPath = "live_set";
  const api = LiveAPI.from(path ?? defaultPath);
  const results = [];

  for (const operation of operations) {
    let result;

    try {
      validateOperationParameters(operation);
      result = executeOperation(api, operation);
    } catch (error) {
      throw new Error(`Operation failed: ${errorMessage(error)}`);
    }

    results.push({
      operation,
      result,
    });
  }

  // Include path in result if:
  // 1. Path was explicitly provided, OR
  // 2. Path changed during operations (e.g., via goto)
  const pathChanged = api.path !== defaultPath;
  const includePath = path != null || pathChanged;

  return {
    ...(includePath ? { path: api.path } : {}),
    id: api.id,
    results,
  };
}
