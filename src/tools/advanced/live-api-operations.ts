// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Operation types the ppal-live-api tool accepts, grouped the way the tool
 * description groups them. Shared so the schema enum and the dispatch table
 * can't drift apart.
 */
export const LIVE_API_OPERATION_TYPES = [
  // Live Object Model
  "get",
  "set",
  "set-property",
  "call",
  "goto",
  "info",
  "getcount",
  "getstring",

  // Producer Pal helpers, returning normalized values
  "get-property",
  "get-child-ids",
  "exists",
  "get-color",
  "set-color",

  // The LiveAPI object itself, not the Live object it points at
  "get-field",
  "set-path",
  "set-mode",
  "set-id",
  "call-method",
] as const;

// Old spellings of the renamed operations, still accepted but never published.
// get_property became get-field because get-property was already taken by
// getProperty, a different operation.
export const LIVE_API_OPERATION_ALIASES = {
  set_property: "set-property",
  getProperty: "get-property",
  getChildIds: "get-child-ids",
  getColor: "get-color",
  setColor: "set-color",
  get_property: "get-field",
  set_path: "set-path",
  set_mode: "set-mode",
  set_id: "set-id",
  call_method: "call-method",
} as const;

// call/call-method and get/get-field are not aliases: `call` and `get` reach
// the Live object, their counterparts reach the JavaScript wrapper. Only
// set/set-property really do the same write.

export type OperationType = (typeof LIVE_API_OPERATION_TYPES)[number];

/** Cap on operations per call, so one request can't tie up Live indefinitely. */
export const MAX_OPERATIONS = 50;

export interface LiveApiOperation {
  type: OperationType;
  property?: string;
  method?: string;
  value?: unknown;
  args?: unknown[];
  /** Probe builds only: run this one operation against its own object. */
  path?: string;
}
