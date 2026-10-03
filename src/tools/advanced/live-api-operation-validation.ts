// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Checks a whole ppal-live-api call before any of it runs. The operations
// write to Live and can't be taken back, so a malformed one late in the list
// must not leave the earlier ones applied (ADR-0035).

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type ParamHome,
  refuseParamsOutsideAction,
} from "#src/tools/shared/schema/refuse-params-outside-action.ts";
import {
  type LiveApiOperation,
  MAX_OPERATIONS,
  type OperationType,
} from "#src/tools/advanced/live-api-operations.ts";

/**
 * Refuses a call with a malformed operation list or any malformed operation,
 * before the first one runs.
 * @param operations - The call's operations, as sent
 * @throws Error when the list isn't an array, is too long, or holds an
 *   operation with an unknown type or a missing parameter
 */
export function validateOperations(operations: LiveApiOperation[]): void {
  if (!Array.isArray(operations)) {
    throw new Error("operations must be an array");
  }

  if (operations.length > MAX_OPERATIONS) {
    throw new Error(
      `operations array cannot exceed ${MAX_OPERATIONS} operations`,
    );
  }

  for (const [index, operation] of operations.entries()) {
    try {
      validateOperation(operation);
    } catch (error) {
      throw new Error(operationError(index, error), { cause: error });
    }

    refuseParamsTheTypeIgnores(operation, index);
  }
}

/**
 * The message for an operation that failed, naming it by position.
 * @param index - The operation's position in the call, counting from 0
 * @param error - What went wrong
 * @returns The message
 */
export function operationError(index: number, error: unknown): string {
  return `operations[${index}] (counting from 0): ${errorMessage(error)}`;
}

// --- Helpers below main exports ---

// The operations that read each param. A param on any other operation is the
// call's mistake or the type's, and nothing says which.
const PROPERTY_TYPES = [
  "get",
  "set",
  "set-property",
  "get-field",
  "get-property",
  "get-child-ids",
  "getcount",
  "getstring",
];
const CALL_TYPES = ["call", "call-method"];
const OPERATION_PARAM_HOMES: Record<string, ParamHome> = {
  property: { type: PROPERTY_TYPES },
  method: { type: CALL_TYPES },
  args: { type: CALL_TYPES },
  value: {
    type: [
      "set",
      "set-property",
      "goto",
      "set-color",
      "set-path",
      "set-mode",
      "set-id",
    ],
  },
};

/**
 * Refuses an operation that sends a param its type doesn't read.
 * @param operation - The operation, as sent
 * @param index - Its place in the call's operations
 * @throws Error naming the operation, the param, and where it applies
 */
function refuseParamsTheTypeIgnores(
  operation: LiveApiOperation,
  index: number,
): void {
  try {
    refuseParamsOutsideAction(
      { type: operation.type },
      { ...operation },
      OPERATION_PARAM_HOMES,
    );
  } catch (error) {
    throw new Error(operationError(index, error), { cause: error });
  }
}

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

const OPERATION_REQUIREMENTS: Record<OperationType, OperationRequirements> = {
  "get-field": { property: true },
  "set-property": { property: true, valueDefined: true },
  "call-method": { method: true },
  get: { property: true },
  set: { property: true, valueDefined: true },
  call: { method: true },
  goto: { valueTruthy: true },
  info: {},
  "get-property": { property: true },
  "get-child-ids": { property: true },
  exists: {},
  "get-color": {},
  "set-color": { valueTruthy: true },
  // valueDefined, not valueTruthy: "" and 0 are the meaningful values here.
  "set-path": { valueDefined: true },
  "set-mode": { valueDefined: true },
  "set-id": { valueDefined: true },
  getcount: { property: true },
  getstring: { property: true },
};

const OPERATION_ERROR_MESSAGES: Record<OperationType, OperationErrorMessages> =
  {
    "get-field": { property: "get-field operation requires property" },
    "set-property": {
      property: "set-property operation requires property",
      value: "set-property operation requires value",
    },
    "call-method": { method: "call-method operation requires method" },
    get: { property: "get operation requires property" },
    set: {
      property: "set operation requires property",
      value: "set operation requires value",
    },
    call: { method: "call operation requires method" },
    goto: { value: "goto operation requires value (path)" },
    info: {},
    "get-property": { property: "get-property operation requires property" },
    "get-child-ids": {
      property: "get-child-ids operation requires property (child type)",
    },
    exists: {},
    "get-color": {},
    "set-color": { value: "set-color operation requires value (color)" },
    "set-path": { value: "set-path operation requires value (path)" },
    "set-mode": { value: "set-mode operation requires value (mode)" },
    "set-id": { value: "set-id operation requires value (id)" },
    getcount: { property: "getcount operation requires property (child type)" },
    getstring: { property: "getstring operation requires property" },
  };

/**
 * Validates operation parameters based on operation type
 * @param operation - The operation object
 * @throws If the type is unknown or required parameters are missing
 */
function validateOperation(operation: LiveApiOperation): void {
  const { type, property, method, value } = operation;

  // Own keys only: `in` would let "toString" through.
  if (!Object.hasOwn(OPERATION_REQUIREMENTS, type)) {
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
