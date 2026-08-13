// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import {
  MAX_OPERATIONS,
  type OperationType,
} from "#src/tools/advanced/live-api-operations.ts";

interface OperationRequirements {
  property?: boolean;
  method?: boolean;
  valueDefined?: boolean;
  valueTruthy?: boolean;
}

interface OperationErrorMessages {
  property?: string;
  method?: string;
  value?: string;
}

export interface LiveApiOperation {
  type: OperationType;
  property?: string;
  method?: string;
  value?: unknown;
  args?: unknown[];
}

interface LiveApiArgs {
  path?: string;
  operations: LiveApiOperation[];
}

interface OperationResult {
  operation: LiveApiOperation;
  result: unknown;
}

interface LiveApiResult {
  path?: string;
  id: string;
  results: OperationResult[];
}

const OPERATION_REQUIREMENTS: Record<OperationType, OperationRequirements> = {
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
  // valueDefined, not valueTruthy: "" and 0 are the meaningful values here.
  set_path: { valueDefined: true },
  set_mode: { valueDefined: true },
  getcount: { property: true },
  getstring: { property: true },
};

const OPERATION_ERROR_MESSAGES: Record<OperationType, OperationErrorMessages> =
  {
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
    info: {},
    getProperty: { property: "getProperty operation requires property" },
    getChildIds: {
      property: "getChildIds operation requires property (child type)",
    },
    exists: {},
    getColor: {},
    setColor: { value: "setColor operation requires value (color)" },
    set_path: { value: "set_path operation requires value (path)" },
    set_mode: { value: "set_mode operation requires value (mode)" },
    getcount: { property: "getcount operation requires property (child type)" },
    getstring: { property: "getstring operation requires property" },
  };

/**
 * Validates operation parameters based on operation type
 * @param operation - The operation object
 * @throws If required parameters are missing
 */
function validateOperationParameters(operation: LiveApiOperation): void {
  const { type, property, method, value } = operation;

  if (!(type in OPERATION_REQUIREMENTS)) {
    throw new Error(
      `Unknown operation type: ${type}. Valid types: ${Object.keys(OPERATION_REQUIREMENTS).join(", ")}`,
    );
  }

  const requirements = OPERATION_REQUIREMENTS[type];
  const messages = OPERATION_ERROR_MESSAGES[type];

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
 * @param api - The LiveAPI instance
 * @param operation - The operation to execute
 * @returns The result of the operation
 */
function executeOperation(api: LiveAPI, operation: LiveApiOperation): unknown {
  const { type } = operation;

  // Property and method are validated by validateOperationParameters
  const property = operation.property as string;
  const method = operation.method as string;

  switch (type) {
    case "get":
      return api.get(property);

    case "set":
      return api.set(property, operation.value);

    case "set_property":
      api.set(property, operation.value);

      // api.set() returns nothing, so echo the input rather than undefined.
      return operation.value;

    case "call": {
      const callArgs = (operation.args ?? []) as (string | number | boolean)[];

      return api.call(method, ...callArgs);
    }

    case "goto":
      return api.goto(operation.value as string);

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
      return api.setColor(operation.value as string);

    default:
      return executeObjectOperation(api, operation);
  }
}

/**
 * Executes an operation against the LiveAPI JavaScript object itself, rather
 * than the Live object it points at
 * @param api - The LiveAPI instance
 * @param operation - The operation to execute
 * @returns The result of the operation
 */
function executeObjectOperation(
  api: LiveAPI,
  operation: LiveApiOperation,
): unknown {
  const { type } = operation;

  // Property and method are validated by validateOperationParameters
  const property = operation.property as string;
  const method = operation.method as string;

  switch (type) {
    case "get_property":
      return (api as unknown as Record<string, unknown>)[property];

    case "set_path":
      // `path` is readonly in the type declarations so ordinary code can't
      // retarget an object. This tool is the deliberate exception: assigning ""
      // is the only way to release the path listeners Live installs.
      (api as unknown as { path: string }).path = operation.value as string;

      // Read back — Max may normalize or reject the value.
      return api.path;

    case "set_mode":
      api.mode = operation.value as number;

      return api.mode;

    case "call_method": {
      const args = operation.args ?? [];
      const methodFn = (api as unknown as Record<string, unknown>)[method];

      if (typeof methodFn !== "function") {
        throw new Error(`Method "${method}" not found on LiveAPI object`);
      }

      return methodFn.apply(api, args);
    }

    case "getcount":
      return api.getcount(property);

    case "getstring":
      return api.getstring(property);

    default:
      throw new Error(`Unknown operation type: ${type as string}`);
  }
}

/**
 * Provides direct, low-level access to the Live API for research, development, and debugging
 * @param args - The parameters
 * @param args.path - Optional LiveAPI path
 * @param args.operations - Array of operations to execute
 * @param _context - Internal context object (unused)
 * @returns Result object with path, id, and operation results
 */
export function liveApi(
  { path, operations }: LiveApiArgs,
  _context: Partial<ToolContext> = {},
): LiveApiResult {
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
  const results: OperationResult[] = [];

  try {
    for (const operation of operations) {
      let result: unknown;

      try {
        validateOperationParameters(operation);
        result = executeOperation(api, operation);
      } catch (error) {
        throw new Error(`Operation failed: ${errorMessage(error)}`, {
          cause: error,
        });
      }

      results.push({
        operation,
        result,
      });
    }

    // Read both before the release below zeroes them.
    const finalPath = api.path;
    const finalId = api.id;

    // Include path in result if:
    // 1. Path was explicitly provided, OR
    // 2. Path changed during operations (e.g., via goto)
    const pathChanged = finalPath !== defaultPath;
    const includePath = path != null || pathChanged;

    return {
      ...(includePath ? { path: finalPath } : {}),
      id: finalId,
      results,
    };
  } finally {
    // Live arms a path listener on every collection along a path-based
    // LiveAPI's path and never takes them down on its own — clearing the path
    // is the only thing that does. Skip this and every call leaves one armed
    // for the life of the device, costing ~4,900 bytes of Ableton log apiece
    // on every later structural change to the Live Set. Measured on 12.4.3.
    (api as unknown as { path: string }).path = "";
  }
}
