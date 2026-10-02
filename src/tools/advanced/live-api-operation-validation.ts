// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Checks a whole ppal-live-api call before any of it runs. The operations
// write to Live and can't be taken back, so a malformed one late in the list
// must not leave the earlier ones applied (ADR-0035).

import { errorMessage } from "#src/shared/error-message.ts";
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

  for (const operation of operations) {
    try {
      validateOperation(operation);
    } catch (error) {
      throw new Error(`Operation failed: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }
}

// --- Helpers below main exports ---

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
