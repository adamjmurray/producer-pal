// src/tools/raw-live-api.js

const MAX_OPERATIONS = 50;

/**
 * Provides direct, low-level access to the Live API for research, development, and debugging
 * @param {Object} args - The parameters
 * @param {string} [args.path] - Optional LiveAPI path (e.g., "live_set tracks 0")
 * @param {Array} args.operations - Array of operations to execute (max 50)
 * @param {string} args.operations[].type - Operation type: "get", "call", or "set"
 * @param {string} [args.operations[].property] - Property name for get/set operations
 * @param {string} [args.operations[].method] - Method name for call operations
 * @param {Array} [args.operations[].args] - Arguments for call operations
 * @param {*} [args.operations[].value] - Value for set operations
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
        case "get":
          if (!operation.property) {
            throw new Error("get operation requires property");
          }
          result = api[operation.property];
          break;

        case "call":
          if (!operation.method) {
            throw new Error("call operation requires method");
          }
          const args = operation.args || [];
          result = api[operation.method](...args);
          break;

        case "set":
          if (!operation.property) {
            throw new Error("set operation requires property");
          }
          if (operation.value === undefined) {
            throw new Error("set operation requires value");
          }
          api[operation.property] = operation.value;
          result = api[operation.property];
          break;

        default:
          throw new Error(`Unknown operation type: ${type}`);
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
