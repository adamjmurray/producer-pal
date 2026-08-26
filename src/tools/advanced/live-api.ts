// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  clearLiveApiMemo,
  untrackLiveApiObject,
} from "#src/live-api-adapter/live-api-release.ts";
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
  /** Probe builds only: run this one operation against its own object. */
  path?: string;
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
  set_id: { valueDefined: true },
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
    set_id: { value: "set_id operation requires value (id)" },
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

      // api.set() returns 1 whether or not the write lands, so echo the input.
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
      // retarget an object. This debug tool is a deliberate exception; the
      // other write is the automatic release in live-api-release.ts.
      (api as unknown as { path: string }).path = operation.value as string;

      // Read back — Max may normalize or reject the value.
      return api.path;

    case "set_mode":
      api.mode = operation.value as number;

      return api.mode;

    case "set_id":
      // Retargets by id, the way set_path does by path. Wants the bare number:
      // the "id N" form points the object at nothing instead.
      (api as unknown as { id: string | number }).id = operation.value as
        | string
        | number;

      // Read back — a bad id is ignored silently, leaving the previous target.
      return api.id;

    case "call_method": {
      const args = operation.args ?? [];
      const methodFn = (api as unknown as Record<string, unknown>)[method];

      if (typeof methodFn !== "function") {
        throw new Error(`Method "${method}" not found on LiveAPI object`);
      }

      // freepeer() frees the JS peer and leaves the path listener armed — bad
      // enough on its own, and it's what the probes here are for. Pooling the
      // result would be worse: a later request would be handed a freed object.
      if (method === "freepeer") {
        untrackLiveApiObject(api);
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
 * Pick the object an operation runs against.
 *
 * An operation carrying its own `path` gets a separate object, so the call can
 * mutate through one while still holding another — the one thing `goto` cannot
 * do, since it moves the only object there is. Measuring whether a held object
 * goes stale after a mutation needs exactly that. Everything else runs against
 * the object the call's top-level `path` built.
 *
 * Probe builds only. Without ENABLE_OBJECT_PROBE the schema has no
 * per-operation `path`, and this guard makes the behavior unreachable even for
 * a caller that skips the schema.
 *
 * @param defaultApi - The object built from the call's top-level path
 * @param operation - The operation about to run
 * @returns The object to run it against
 */
function objectForOperation(
  defaultApi: LiveAPI,
  operation: LiveApiOperation,
): LiveAPI {
  if (operation.path == null || process.env.ENABLE_OBJECT_PROBE !== "true") {
    return defaultApi;
  }

  // Emptying the memo is what makes this a *separate* object. live_set and the
  // four other STABLE_TARGETS are memoized, so without it two handles onto one
  // of them would be the same object — and a probe reading one object through
  // two handles reports "not stale" for the wrong reason.
  clearLiveApiMemo();

  return LiveAPI.from(operation.path);
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

  // This tool retargets its object in place — goto, set_path, set_id, set_mode
  // — and can freepeer it outright, none of which any other caller does.
  // Emptying the memo first means the object it gets is its own rather than one
  // some other part of the request is still holding, and emptying it after
  // keeps the retargeted object from being handed out under its original path.
  clearLiveApiMemo();

  const api = LiveAPI.from(path ?? defaultPath);
  const results: OperationResult[] = [];

  try {
    for (const operation of operations) {
      let result: unknown;

      try {
        validateOperationParameters(operation);
        result = executeOperation(
          objectForOperation(api, operation),
          operation,
        );
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
  } finally {
    clearLiveApiMemo();
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
