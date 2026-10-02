// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  clearLiveApiMemo,
  untrackLiveApiObject,
} from "#src/live-api-adapter/live-api-release.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type LiveApiOperation } from "#src/tools/advanced/live-api-operations.ts";
import { validateOperations } from "#src/tools/advanced/live-api-operation-validation.ts";

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

/**
 * Executes a single operation on the LiveAPI instance
 * @param api - The LiveAPI instance
 * @param operation - The operation to execute
 * @returns The result of the operation
 */
function executeOperation(api: LiveAPI, operation: LiveApiOperation): unknown {
  const { type } = operation;

  // Property and method are checked up front by validateOperations
  const property = operation.property as string;
  const method = operation.method as string;

  switch (type) {
    case "get":
      return api.get(property);

    case "set":
      return api.set(property, operation.value);

    case "set-property":
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

    case "get-property":
      return api.getProperty(property);

    case "get-child-ids":
      return api.getChildIds(property);

    case "exists":
      return api.exists();

    case "get-color":
      return api.getColor();

    case "set-color":
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

  // Property and method are checked up front by validateOperations
  const property = operation.property as string;
  const method = operation.method as string;

  switch (type) {
    case "get-field":
      return (api as unknown as Record<string, unknown>)[property];

    case "set-path":
      // `path` is readonly in the type declarations so ordinary code can't
      // retarget an object. This debug tool is a deliberate exception; the
      // other write is the automatic release in live-api-release.ts.
      (api as unknown as { path: string }).path = operation.value as string;

      // Read back — Max may normalize or reject the value.
      return api.path;

    case "set-mode":
      api.mode = operation.value as number;

      return api.mode;

    case "set-id":
      // Retargets by id, the way set-path does by path. Wants the bare number:
      // the "id N" form points the object at nothing instead.
      (api as unknown as { id: string | number }).id = operation.value as
        | string
        | number;

      // Read back — a bad id is ignored silently, leaving the previous target.
      return api.id;

    case "call-method": {
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
  // other STABLE_TARGETS are memoized, so without it two handles onto one of
  // them would be the same object — and a probe reading one object through two
  // handles reports "not stale" for the wrong reason.
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
  // Every operation is checked before any runs, so a malformed one refuses the
  // call with nothing done (ADR-0035).
  validateOperations(operations);

  const defaultPath = "live_set";

  // This tool retargets its object in place — goto, set-path, set-id, set-mode
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
