const MAX_OPERATIONS = 50;

/**
 * Provides direct, low-level access to the Live API for research, development, and debugging
 * @param {Object} args - The parameters
 * @param {string} [args.path] - Optional LiveAPI path (e.g., "live_set tracks 0")
 * @param {Array} args.operations - Array of operations to execute (max 50)
 * @param {string} args.operations[].type - Operation type: "get_property", "set_property", "call_method", "get", "set", "call", "goto", "info", "getProperty", "getChildIds", "exists", "getColor", or "setColor"
 * @param {string} [args.operations[].property] - Property name for get_property/set_property operations or get/set convenience operations
 * @param {string} [args.operations[].method] - Method name for call_method operations
 * @param {Array} [args.operations[].args] - Arguments for call_method operations or convenience operations
 * @param {*} [args.operations[].value] - Value for set_property operations
 * @returns {Object} Result object with path, id, and operation results
 */
export function rawLiveApi({ path, operations } = {}) {
  if (!Array.isArray(operations)) {
    throw new Error("operations must be an array");
  }

  if (operations.length > MAX_OPERATIONS) {
    throw new Error(
      `operations array cannot exceed ${MAX_OPERATIONS} operations`,
    );
  }

  const api = new LiveAPI(path);

  const results = [];

  for (const operation of operations) {
    const { type } = operation;

    let result;
    try {
      switch (type) {
        case "get_property":
          if (!operation.property) {
            throw new Error("get_property operation requires property");
          }
          result = api[operation.property];
          break;

        case "set_property":
          if (!operation.property) {
            throw new Error("set_property operation requires property");
          }
          if (operation.value === undefined) {
            throw new Error("set_property operation requires value");
          }
          api[operation.property] = operation.value;
          result = api[operation.property];
          break;

        case "call_method":
          if (!operation.method) {
            throw new Error("call_method operation requires method");
          }
          const args = operation.args || [];
          result = api[operation.method](...args);
          break;

        // Convenience shortcuts
        case "get":
          if (!operation.property) {
            throw new Error("get operation requires property");
          }
          result = api.get(operation.property);
          break;

        case "set":
          if (!operation.property) {
            throw new Error("set operation requires property");
          }
          if (operation.value === undefined) {
            throw new Error("set operation requires value");
          }
          result = api.set(operation.property, operation.value);
          break;

        case "call":
          if (!operation.method) {
            throw new Error("call operation requires method");
          }
          const callArgs = operation.args || [];
          result = api.call(operation.method, ...callArgs);
          break;

        case "goto":
          if (!operation.value) {
            throw new Error("goto operation requires value (path)");
          }
          result = api.goto(operation.value);
          break;

        case "info":
          result = api.info;
          break;

        case "getProperty":
          if (!operation.property) {
            throw new Error("getProperty operation requires property");
          }
          result = api.getProperty(operation.property);
          break;

        case "getChildIds":
          if (!operation.property) {
            throw new Error(
              "getChildIds operation requires property (child type)",
            );
          }
          result = api.getChildIds(operation.property);
          break;

        case "exists":
          result = api.exists();
          break;

        case "getColor":
          result = api.getColor();
          break;

        case "setColor":
          if (!operation.value) {
            throw new Error("setColor operation requires value (color)");
          }
          result = api.setColor(operation.value);
          break;

        default:
          throw new Error(
            `Unknown operation type: ${type}. Valid types: get_property, set_property, call_method, get, set, call, goto, info, getProperty, getChildIds, exists, getColor, setColor`,
          );
      }
    } catch (error) {
      throw new Error(`Operation failed: ${error.message}`);
    }

    results.push({
      operation,
      result,
    });
  }

  return {
    path: api.path,
    id: api.id,
    results,
  };
}
