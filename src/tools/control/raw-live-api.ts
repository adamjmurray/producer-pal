// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";

const MAX_OPERATIONS = 50;

export type OperationType =
  | "get_property"
  | "set_property"
  | "call_method"
  | "get"
  | "set"
  | "call"
  | "goto"
  | "info"
  | "getProperty"
  | "getChildIds"
  | "exists"
  | "getColor"
  | "setColor";

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

export interface RawApiOperation {
  type: OperationType;
  property?: string;
  method?: string;
  value?: unknown;
  args?: unknown[];
}

interface RawLiveApiArgs {
  path?: string;
  operations: RawApiOperation[];
}

interface OperationResult {
  operation: RawApiOperation;
  result: unknown;
}

interface RawLiveApiResult {
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
  };

/**
 * Validates operation parameters based on operation type
 * @param operation - The operation object
 * @throws If required parameters are missing
 */
function validateOperationParameters(operation: RawApiOperation): void {
  const { type, property, method, value } = operation;

  if (!(type in OPERATION_REQUIREMENTS)) {
    throw new Error(
      `Unknown operation type: ${type}. Valid types: get_property, set_property, call_method, get, set, call, goto, info, getProperty, getChildIds, exists, getColor, setColor`,
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
function executeOperation(api: LiveAPI, operation: RawApiOperation): unknown {
  const { type } = operation;

  // Property and method are validated by validateOperationParameters
  const property = operation.property as string;
  const method = operation.method as string;

  switch (type) {
    case "get_property":
      return (api as unknown as Record<string, unknown>)[property];

    case "set_property":
      api.set(property, operation.value);

      return operation.value;

    case "call_method": {
      const args = operation.args ?? [];
      const methodFn = (api as unknown as Record<string, unknown>)[method];

      if (typeof methodFn !== "function") {
        throw new Error(`Method "${method}" not found on LiveAPI object`);
      }

      return methodFn.apply(api, args);
    }

    case "get":
      return api.get(property);

    case "set":
      return api.set(property, operation.value);

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
export function rawLiveApi(
  { path, operations }: RawLiveApiArgs,
  _context: Partial<ToolContext> = {},
): RawLiveApiResult {
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

  for (const operation of operations) {
    let result: unknown;

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
